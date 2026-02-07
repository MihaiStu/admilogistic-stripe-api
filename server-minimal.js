const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  console.log('Health check called');
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});

app.get('/', (req, res) => {
  res.json({ 
    service: 'minimal test', 
    working: true 
  });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log('═════════════════════════════════');
  console.log('Minimal server running on port', PORT);
  console.log('═════════════════════════════════');
});
