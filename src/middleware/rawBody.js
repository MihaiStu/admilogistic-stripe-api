/**
 * Middleware que preserva el body raw (Buffer) para verificación de firma Stripe.
 * Se aplica SOLO a la ruta del webhook; el resto usa express.json() normal.
 */
function rawBodyMiddleware(req, res, buf) {
  if (req.originalUrl === '/api/stripe/webhook') {
    req.rawBody = buf;
  }
}

module.exports = rawBodyMiddleware;
