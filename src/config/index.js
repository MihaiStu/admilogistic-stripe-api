require('dotenv').config();

const required = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

// Validar que todas las variables requeridas existen
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[CONFIG] Falta variable de entorno: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim()),
  },
};
