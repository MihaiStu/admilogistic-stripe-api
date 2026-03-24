const express = require('express');
const cors = require('cors');

// Config y servicios internos
const config = require('./src/config');
const rawBodyMiddleware = require('./src/middleware/rawBody');
const stripeRoutes = require('./src/routes/stripe');
const ocrRoutes = require('./src/routes/ocr');

const app = express();

/**
 * ─────────────────────────────────────────────
 * HEALTH CHECK PRIMERO
 * CRÍTICO: Railway necesita respuesta rápida
 * ─────────────────────────────────────────────
 */
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'admilogistic-stripe-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development'
  });
});

/**
 * ─────────────────────────────────────────────
 * LOGGING MIDDLEWARE (debugging Railway)
 * ─────────────────────────────────────────────
 */
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'N/A'}`);
  next();
});

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
    credentials: true
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
app.use('/api/ocr', ocrRoutes);

/**
 * ─────────────────────────────────────────────
 * ROOT route (info básica)
 * ─────────────────────────────────────────────
 */
app.get('/', (_req, res) => {
  res.status(200).json({
    service: 'AdmiLogistic Stripe API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      checkout: '/api/stripe/checkout',
      portal: '/api/stripe/portal',
      webhook: '/api/stripe/webhook'
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * ─────────────────────────────────────────────
 * 404 Handler
 * ─────────────────────────────────────────────
 */
app.use((req, res) => {
  console.log(`[404] Ruta no encontrada: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Endpoint no encontrado',
    path: req.path,
    availableEndpoints: ['/health', '/api/stripe/checkout', '/api/stripe/portal', '/api/stripe/webhook']
  });
});

/**
 * ─────────────────────────────────────────────
 * Error Handler Global
 * ─────────────────────────────────────────────
 */
app.use((err, req, res, next) => {
  console.error('[ERROR GLOBAL]', err);
  res.status(err.status || 500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Error procesando la petición',
    timestamp: new Date().toISOString()
  });
});

/**
 * ─────────────────────────────────────────────
 * Manejadores de errores no capturados
 * ─────────────────────────────────────────────
 */
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  console.error('Stack:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION] En:', promise);
  console.error('Razón:', reason);
});

/**
 * ─────────────────────────────────────────────
 * START SERVER (CLAVE PARA RAILWAY)
 * ─────────────────────────────────────────────
 * Railway INYECTA process.env.PORT
 * NUNCA hardcodear puertos
 * 
 * DELAY: Railway tiene un bug donde mata el contenedor si arranca
 * demasiado rápido. Este delay de 3 segundos da tiempo a Railway
 * para preparar el healthcheck correctamente.
 */
const PORT = process.env.PORT || 3001;

// Delay de inicio para Railway
setTimeout(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════════════');
    console.log(`[STRIPE-API] ✅ Servidor LISTO en 0.0.0.0:${PORT}`);
    console.log(`[STRIPE-API] 🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[STRIPE-API] 🔐 CORS orígenes configurados: ${config.server.corsOrigins.length}`);
    config.server.corsOrigins.forEach(origin => {
      console.log(`   - ${origin}`);
    });
    console.log(`[STRIPE-API] 🏥 Health check: http://0.0.0.0:${PORT}/health`);
    console.log(`[STRIPE-API] 💳 Stripe Webhook: http://0.0.0.0:${PORT}/api/stripe/webhook`);
    console.log('═══════════════════════════════════════════════════');
  });

  /**
   * ─────────────────────────────────────────────
   * Graceful Shutdown
   * ─────────────────────────────────────────────
   */
  process.on('SIGTERM', () => {
    console.log('[SIGTERM] Señal recibida, cerrando servidor...');
    server.close(() => {
      console.log('[SIGTERM] Servidor cerrado correctamente');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('[SIGINT] Señal recibida, cerrando servidor...');
    server.close(() => {
      console.log('[SIGINT] Servidor cerrado correctamente');
      process.exit(0);
    });
  });

  // Exportar para tests (opcional)
  module.exports = server;
}, 3000); // 3 segundos de delay para Railway