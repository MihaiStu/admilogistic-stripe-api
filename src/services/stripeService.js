const Stripe = require('stripe');
const config = require('../config');
const { resolveAccessFromPrice, revokeAllAccess } = require('./accessResolver');
const db = require('./dbService');

const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });

// ─────────────────────────────────────────────────────────
// 1. CHECKOUT
// ─────────────────────────────────────────────────────────

/**
 * Crea una sesión de Stripe Checkout para suscripción.
 * Reutiliza el customer si ya existe.
 *
 * @param {{ userId: string, email: string, priceId: string, successUrl: string, cancelUrl: string }}
 * @returns {{ url: string }} URL de redirección a Stripe
 */
async function createCheckoutSession({ userId, email, priceId, successUrl, cancelUrl }) {
  // Buscar si el usuario ya tiene un stripe_customer_id
  const existing = await db.findSubscriptionByUserId(userId);
  let customerId = existing?.stripe_customer_id;

  // Si no existe, buscar en Stripe por email
  if (!customerId) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }
  }

  // Parámetros de la sesión
  const sessionParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata: { user_id: userId },
    subscription_data: {
      metadata: { user_id: userId },
    },
  };

  if (customerId) {
    sessionParams.customer = customerId;
  } else {
    sessionParams.customer_email = email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return { url: session.url };
}

// ─────────────────────────────────────────────────────────
// 2. CHANGE PLAN (upgrade / downgrade)
// ─────────────────────────────────────────────────────────

/**
 * Cambia el plan de una suscripción existente.
 * - Upgrade: proration_behavior = create_prorations
 * - Downgrade: proration_behavior = none
 *
 * @param {{ subscriptionId: string, newPriceId: string }}
 * @returns {{ success: boolean, subscription: object }}
 */
async function changePlan({ subscriptionId, newPriceId }) {
  // Obtener suscripción actual
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const currentItem = subscription.items.data[0];
  const currentPriceAmount = currentItem.price.unit_amount;

  // Obtener el nuevo precio para comparar
  const newPrice = await stripe.prices.retrieve(newPriceId);
  const newPriceAmount = newPrice.unit_amount;

  // Determinar dirección del cambio
  const isUpgrade = newPriceAmount > currentPriceAmount;

  const updated = await stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: currentItem.id,
        price: newPriceId,
      },
    ],
    proration_behavior: isUpgrade ? 'create_prorations' : 'none',
  });

  return { success: true, subscription: updated };
}

// ─────────────────────────────────────────────────────────
// 3. WEBHOOK
// ─────────────────────────────────────────────────────────

/**
 * Procesa un evento de Stripe webhook.
 * @param {Buffer} rawBody - Body crudo de la petición
 * @param {string} signature - Header stripe-signature
 */
async function handleWebhook(rawBody, signature) {
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    config.stripe.webhookSecret
  );

  console.log(`[WEBHOOK] Evento recibido: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;

    case 'invoice.paid':
      await handleInvoicePaid(event.data.object);
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;

    default:
      console.log(`[WEBHOOK] Evento no gestionado: ${event.type}`);
  }

  return { received: true };
}

// ── Handlers internos ───────────────────────────────────

/**
 * checkout.session.completed
 * Vincula el customer y subscription al usuario en BD.
 */
async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.user_id;
  if (!userId) {
    console.error('[WEBHOOK] checkout.session.completed sin user_id en metadata');
    return;
  }

  const customerId = session.customer;
  const subscriptionId = session.subscription;

  console.log(`[WEBHOOK] Checkout completado: user=${userId}, customer=${customerId}`);

  await db.upsertSubscription(userId, {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    status: 'active',
  });
}

/**
 * invoice.paid
 * Lee metadata del precio, resuelve accesos, actualiza BD.
 * Este es el evento principal que activa/renueva el acceso.
 */
async function handleInvoicePaid(invoice) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  // Buscar usuario por customer_id
  const sub = await db.findSubscriptionByCustomerId(customerId);
  if (!sub) {
    console.error(`[WEBHOOK] invoice.paid: no se encontró usuario para customer ${customerId}`);
    return;
  }

  // Obtener la suscripción completa con info del precio
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price'],
  });

  const price = subscription.items.data[0]?.price;
  if (!price) {
    console.error('[WEBHOOK] invoice.paid: no se encontró precio en la suscripción');
    return;
  }

  // Resolver accesos desde metadata del precio
  const access = resolveAccessFromPrice(price);

  console.log(`[WEBHOOK] invoice.paid: user=${sub.user_id}, plan=${access.plan}, accesos=`, access);

  await db.updateAccess(sub.user_id, access, {
    stripe_subscription_id: subscriptionId,
    stripe_price_id: price.id,
    status: 'active',
    cancel_at_period_end: false,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  });
}

/**
 * invoice.payment_failed
 * Marca la suscripción como past_due.
 */
async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  const sub = await db.findSubscriptionByCustomerId(customerId);
  if (!sub) {
    console.error(`[WEBHOOK] payment_failed: no se encontró usuario para customer ${customerId}`);
    return;
  }

  console.log(`[WEBHOOK] Pago fallido: user=${sub.user_id}`);

  await db.upsertSubscription(sub.user_id, { status: 'past_due' });
}

/**
 * customer.subscription.updated
 * Actualiza plan y accesos si el precio cambió (upgrade/downgrade).
 */
async function handleSubscriptionUpdated(subscription) {
  const customerId = subscription.customer;
  const sub = await db.findSubscriptionByCustomerId(customerId);
  if (!sub) {
    console.error(`[WEBHOOK] subscription.updated: no se encontró usuario para customer ${customerId}`);
    return;
  }

  // Obtener precio expandido
  const fullSub = await stripe.subscriptions.retrieve(subscription.id, {
    expand: ['items.data.price'],
  });

  const price = fullSub.items.data[0]?.price;
  if (!price) return;

  const access = resolveAccessFromPrice(price);
  const status = fullSub.cancel_at_period_end ? 'canceling' : fullSub.status;

  console.log(`[WEBHOOK] subscription.updated: user=${sub.user_id}, plan=${access.plan}, status=${status}`);

  await db.updateAccess(sub.user_id, access, {
    stripe_price_id: price.id,
    status,
    cancel_at_period_end: fullSub.cancel_at_period_end || false,
    current_period_start: new Date(fullSub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(fullSub.current_period_end * 1000).toISOString(),
  });
}

/**
 * customer.subscription.deleted
 * Revoca todos los accesos.
 */
async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;
  const sub = await db.findSubscriptionByCustomerId(customerId);
  if (!sub) {
    console.error(`[WEBHOOK] subscription.deleted: no se encontró usuario para customer ${customerId}`);
    return;
  }

  console.log(`[WEBHOOK] Suscripción cancelada: user=${sub.user_id}`);

  const access = revokeAllAccess();
  await db.updateAccess(sub.user_id, access, {
    status: 'canceled',
    stripe_subscription_id: null,
  });
}

module.exports = { createCheckoutSession, changePlan, handleWebhook, stripe };
