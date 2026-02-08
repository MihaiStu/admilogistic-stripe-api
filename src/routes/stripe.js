const { Router } = require('express');
const {
  createCheckoutSession,
  changePlan,
  handleWebhook,
  createPortalSession,
} = require('../services/stripeService');
const { getUserAccess } = require('../services/dbService');

const router = Router();

// ─────────────────────────────────────────────────────────
// POST /api/stripe/checkout
// Crea una sesión de Stripe Checkout para suscripción.
// Body: { userId, email, priceId, successUrl, cancelUrl }
// ─────────────────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  try {
    const { userId, email, priceId, successUrl, cancelUrl } = req.body;

    if (!userId || !email || !priceId) {
      return res.status(400).json({
        error: 'Campos requeridos: userId, email, priceId',
      });
    }

    if (!successUrl || !cancelUrl) {
      return res.status(400).json({
        error: 'Campos requeridos: successUrl, cancelUrl',
      });
    }

    const result = await createCheckoutSession({
      userId,
      email,
      priceId,
      successUrl,
      cancelUrl,
    });

    res.json(result);
  } catch (err) {
    console.error('[CHECKOUT] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/stripe/change-plan
// Upgrade o downgrade de plan.
// Body: { subscriptionId, newPriceId }
// ─────────────────────────────────────────────────────────
router.post('/change-plan', async (req, res) => {
  try {
    const { subscriptionId, newPriceId } = req.body;

    if (!subscriptionId || !newPriceId) {
      return res.status(400).json({
        error: 'Campos requeridos: subscriptionId, newPriceId',
      });
    }

    const result = await changePlan({ subscriptionId, newPriceId });
    res.json(result);
  } catch (err) {
    console.error('[CHANGE-PLAN] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/stripe/portal
// Crea una sesión del Customer Portal de Stripe.
// Body: { customerId, returnUrl }
// ─────────────────────────────────────────────────────────
router.post('/portal', async (req, res) => {
  try {
    const { customerId, returnUrl } = req.body;

    if (!customerId || !returnUrl) {
      return res.status(400).json({
        error: 'Campos requeridos: customerId, returnUrl',
      });
    }

    const result = await createPortalSession({ customerId, returnUrl });
    res.json(result);
  } catch (err) {
    console.error('[PORTAL] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/stripe/webhook
// Recibe eventos de Stripe y actualiza la BD.
// Header requerido: stripe-signature
// ─────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Falta header stripe-signature' });
    }

    const result = await handleWebhook(req.rawBody, signature);
    res.json(result);
  } catch (err) {
    console.error('[WEBHOOK] Error:', err.message);
    // Stripe espera 200 incluso en errores internos para no reintentar
    // Pero si la firma es inválida, devolver 400
    if (err.type === 'StripeSignatureVerificationError') {
      return res.status(400).json({ error: 'Firma inválida' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/stripe/access/:userId
// Consulta los accesos actuales de un usuario.
// Útil para que los frontends comprueben permisos.
// ─────────────────────────────────────────────────────────
router.get('/access/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'userId requerido' });
    }

    const access = await getUserAccess(userId);
    res.json(access);
  } catch (err) {
    console.error('[ACCESS] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
