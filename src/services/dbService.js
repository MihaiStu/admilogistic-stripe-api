const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// Cliente Supabase con service_role (bypass RLS)
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * Busca una suscripción por user_id.
 */
async function findSubscriptionByUserId(userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Busca una suscripción por stripe_customer_id.
 */
async function findSubscriptionByCustomerId(customerId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Busca una suscripción por stripe_subscription_id.
 */
async function findSubscriptionByStripeSubId(subscriptionId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Crea o actualiza la suscripción de un usuario (upsert por user_id).
 * @param {string} userId
 * @param {object} fields - Campos a guardar/actualizar
 */
async function upsertSubscription(userId, fields) {
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        ...fields,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Actualiza los accesos y plan de un usuario.
 * @param {string} userId
 * @param {{ plan: string, admi: boolean, roadmaster: boolean, tacho: boolean }} access
 * @param {object} [extra] - Campos extra (status, period_start, etc.)
 */
async function updateAccess(userId, access, extra = {}) {
  return upsertSubscription(userId, {
    plan: access.plan,
    access_admi: access.admi,
    access_roadmaster: access.roadmaster,
    access_tacho: access.tacho,
    ...extra,
  });
}

/**
 * Guarda el stripe_customer_id para un usuario.
 */
async function saveCustomerId(userId, customerId) {
  return upsertSubscription(userId, { stripe_customer_id: customerId });
}

/**
 * Obtiene los accesos actuales de un usuario (para que los frontends consulten).
 */
async function getUserAccess(userId) {
  const sub = await findSubscriptionByUserId(userId);
  if (!sub) {
    return {
      plan: 'free',
      status: 'inactive',
      admi: false,
      roadmaster: false,
      tacho: false,
    };
  }
  return {
    plan: sub.plan,
    status: sub.status,
    admi: sub.access_admi,
    roadmaster: sub.access_roadmaster,
    tacho: sub.access_tacho,
    stripe_price_id: sub.stripe_price_id,
    stripe_subscription_id: sub.stripe_subscription_id,
    cancel_at_period_end: sub.cancel_at_period_end,
    current_period_end: sub.current_period_end,
  };
}

module.exports = {
  supabase,
  findSubscriptionByUserId,
  findSubscriptionByCustomerId,
  findSubscriptionByStripeSubId,
  upsertSubscription,
  updateAccess,
  saveCustomerId,
  getUserAccess,
};
