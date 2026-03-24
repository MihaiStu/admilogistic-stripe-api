/**
 * OCR Routes
 * POST /api/ocr/procesar-factura  — procesa un archivo con Claude Vision
 * GET  /api/ocr/uso/:organizacion_id — consulta uso mensual
 */
const { Router } = require('express');
const multer = require('multer');
const { procesarFactura, consultarUso } = require('../services/ocrService');

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Usa PDF, JPG o PNG.'));
    }
  },
});

// ─────────────────────────────────────────────
// POST /api/ocr/procesar-factura
// Body: multipart/form-data
//   - archivo: File (PDF/imagen)
//   - organizacion_id: string
// ─────────────────────────────────────────────
router.post('/procesar-factura', upload.single('archivo'), async (req, res) => {
  try {
    const { organizacion_id } = req.body;

    if (!organizacion_id) {
      return res.status(400).json({ error: 'organizacion_id requerido' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'archivo requerido' });
    }

    const resultado = await procesarFactura(
      req.file.buffer,
      req.file.mimetype,
      organizacion_id
    );

    res.json(resultado);

  } catch (err) {
    const status = err.statusCode || 500;

    if (status === 429) {
      return res.status(429).json({
        error: err.message,
        usos: err.usos,
        limite: err.limite,
        plan: err.plan,
      });
    }

    if (status === 404) {
      return res.status(404).json({ error: err.message });
    }

    console.error('[OCR Route] Error:', err.message);
    res.status(500).json({
      error: 'Error procesando factura',
      detalle: err.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /api/ocr/uso/:organizacion_id
// ─────────────────────────────────────────────
router.get('/uso/:organizacion_id', async (req, res) => {
  try {
    const uso = await consultarUso(req.params.organizacion_id);
    res.json(uso);
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
