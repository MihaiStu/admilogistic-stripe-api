const express = require('express');
const cors = require('cors');
const config = require('./src/config');
const rawBodyMiddleware = require('./src/middleware/rawBody');
const stripeRoutes = require('./src/routes/stripe');

const app = express();

// ── CORS ────────────────────────────────────────────────
app.use(
  cors({
    origin: config.server.corsOrigins,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Body parsing ────────────────────────────────────────
// express.json() con verify para capturar rawBody en webhook
app.use(
  express.json({
    verify: rawBodyMiddleware,
  })
);

// ── Routes ──────────────────────────────────────────────
app.use('/api/stripe', stripeRoutes);

// ── Health check ────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Start ───────────────────────────────────────────────
app.listen(config.server.port, () => {
  console.log(`[STRIPE-API] Servidor escuchando en puerto ${config.server.port}`);
  console.log(`[STRIPE-API] CORS orígenes: ${config.server.corsOrigins.join(', ')}`);
});
