const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  console.log('[HEALTH] Check received');
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'admilogistic-stripe-api'
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'AdmiLogistic Stripe API - Minimal Test',
    working: true,
    version: '1.0.1'
  });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log('═════════════════════════════════════════');
  console.log('[SUCCESS] Server running on port', PORT);
  console.log('[SUCCESS] Health: http://0.0.0.0:' + PORT + '/health');
  console.log('═════════════════════════════════════════');
});
