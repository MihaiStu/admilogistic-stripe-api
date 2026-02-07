const express = require('express');
const cors = require('cors');

// Config y servicios internos
const config = require('./src/config');
const rawBodyMiddleware = require('./src/middleware/rawBody');
const stripeRoutes = require('./src/routes/stripe');

const app = express();

/**
 * ─────────────────────────────────────────────
 * CORS
 * ─────────────────────────────────────────────
 */
app.use(
  cors({
    origin: config.server.corsOrigins,
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Stripe-Signature'],
  })
);

/**
 * ─────────────────────────────────────────────
 * Body parsing
 * IMPORTANTE: rawBody para Stripe Webhooks
 * ─────────────────────────────────────────────
 */
app.use(
  express.json({
    verify: rawBodyMiddleware,
  })
);

/**
 * ─────────────────────────────────────────────
 * Routes
 * ─────────────────────────────────────────────
 */
app.use('/api/stripe', stripeRoutes);

/**
 * ─────────────────────────────────────────────
 * Health check (Railway / monitoring)
 * ─────────────────────────────────────────────
 */
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'admilogistic-stripe-api',
    timestamp: new Date().toISOString(),
  });
});

/**
 * ─────────────────────────────────────────────
 * START SERVER (CLAVE PARA RAILWAY)
 * ─────────────────────────────────────────────
 * Railway INYECTA process.env.PORT
 * NUNCA hardcodear puertos
 */
const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[STRIPE-API] Servidor escuchando en 0.0.0.0:${PORT}`);
  console.log(
    `[STRIPE-API] CORS orígenes: ${config.server.corsOrigins.join(', ')}`
  );
});
