/**
 * OCR Service — Gemini Vision (Google)
 * Extrae datos estructurados de facturas: repostajes, talleres, ingresos, gastos fijos
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

// ─────────────────────────────────────────────
// Límites de uso OCR por plan
// ─────────────────────────────────────────────
const LIMITES_OCR = {
  free:       10,
  demo:       10,
  basic:      50,
  pro:        300,
  premium:    300,
  enterprise: 99999,
};

// ─────────────────────────────────────────────
// Detectar tipo de factura según proveedor hint
// ─────────────────────────────────────────────
function detectarTipoFactura(texto) {
  const t = (texto || '').toLowerCase();

  if (t.includes('mosca') || t.includes('el mosca') || t.includes('gasoil mosca')) {
    return 'EL_MOSCA_GASOIL';
  }
  if (t.includes('galp')) return 'GALP_GASOIL';
  if (t.includes('andamur')) return 'ANDAMUR_GASOIL';
  if (
    t.includes('taller') ||
    t.includes('mecanic') ||
    t.includes('neumatic') ||
    t.includes('neumátic') ||
    t.includes('freno') ||
    t.includes('reparaci') ||
    t.includes('mantenimiento') ||
    t.includes('motor') ||
    t.includes('aceite') ||
    t.includes('itv') ||
    t.includes('filtro')
  ) {
    return 'TALLER_MANTENIMIENTO';
  }
  if (
    t.includes('ingreso') ||
    t.includes('transporte') ||
    t.includes('albarán') ||
    t.includes('albaran') ||
    t.includes('porte') ||
    t.includes('cliente')
  ) {
    return 'INGRESO_TRANSPORTE';
  }
  return 'GASTO_FIJO';
}

// ─────────────────────────────────────────────
// Prompt específico por tipo de factura
// ─────────────────────────────────────────────
function buildPromptPorTipo(tipo) {
  const baseInstruction = `
Analiza este documento y extrae los datos en formato JSON.
Responde ÚNICAMENTE con el JSON, sin explicaciones, sin markdown, sin texto adicional.
Si un campo no aparece en el documento, usa null.
Los importes deben ser números (sin símbolo €), las fechas en formato YYYY-MM-DD.
`.trim();

  const schemas = {
    EL_MOSCA_GASOIL: `
${baseInstruction}
Es un ticket de gasoil de "El Mosca" (proveedor local de combustible).
Puede contener varios camiones en el mismo ticket.

Schema JSON:
{
  "tipo_factura": "EL_MOSCA_GASOIL",
  "proveedor": "El Mosca",
  "fecha": "YYYY-MM-DD",
  "lineas": [
    {
      "matricula": "string (ej: 1234ABC)",
      "litros": number,
      "precio_total": number,
      "precio_litro": number
    }
  ],
  "importe_total": number,
  "centro_repostaje": "string o null",
  "tipo_combustible": "gasoil",
  "confianza": number (0-100, tu nivel de certeza sobre los datos extraídos)
}
`.trim(),

    GALP_GASOIL: `
${baseInstruction}
Es una factura/ticket de GALP.

Schema JSON:
{
  "tipo_factura": "GALP_GASOIL",
  "proveedor": "GALP",
  "fecha": "YYYY-MM-DD",
  "matricula": "string",
  "litros": number,
  "precio_litro": number,
  "importe": number,
  "centro_repostaje": "string (nombre/dirección de la estación)",
  "tipo_combustible": "string (gasoil, gasóleo, AdBlue, etc.)",
  "numero_operacion": "string o null",
  "confianza": number (0-100)
}
`.trim(),

    ANDAMUR_GASOIL: `
${baseInstruction}
Es una factura de ANDAMUR (red de estaciones para camiones).

Schema JSON:
{
  "tipo_factura": "ANDAMUR_GASOIL",
  "proveedor": "Andamur",
  "fecha": "YYYY-MM-DD",
  "matricula": "string",
  "litros": number,
  "precio_litro": number,
  "importe": number,
  "centro_repostaje": "string (nombre de la estación Andamur)",
  "tipo_combustible": "string",
  "numero_operacion": "string o null",
  "confianza": number (0-100)
}
`.trim(),

    TALLER_MANTENIMIENTO: `
${baseInstruction}
Es una factura de taller mecánico, ITV, neumáticos u otro mantenimiento de vehículo.

Schema JSON:
{
  "tipo_factura": "TALLER_MANTENIMIENTO",
  "proveedor": "string (nombre del taller)",
  "fecha": "YYYY-MM-DD",
  "matricula": "string o null",
  "importe": number,
  "descripcion": "string (breve descripción de la avería o trabajo realizado — máx 120 caracteres)",
  "tipo_mantenimiento": "string (ej: FRENOS, RUEDAS, ACEITE, ITV, EXTINTORES, REPARACION_GENERAL, etc.)",
  "km": number,
  "numero_factura": "string o null",
  "confianza": number (0-100)
}

Para "tipo_mantenimiento" usa SOLO uno de: FRENOS, RUEDAS, NEUMATICOS, ACEITE, FILTROS, ITV, EXTINTORES, TACHO, ELECTRICO, CARROCERIA, REPARACION_GENERAL
Para "descripcion" extrae el texto del apartado "Descripción de la Avería" o los conceptos principales.
`.trim(),

    INGRESO_TRANSPORTE: `
${baseInstruction}
Es una factura de ingreso por servicio de transporte (cobro a cliente).

Schema JSON:
{
  "tipo_factura": "INGRESO_TRANSPORTE",
  "fecha": "YYYY-MM-DD",
  "numero_factura": "string",
  "cliente": "string (nombre del cliente)",
  "importe": number (base imponible sin IVA),
  "importe_iva": number,
  "importe_total": number (total con IVA),
  "concepto": "string (descripción del servicio)",
  "matricula": "string o null",
  "confianza": number (0-100)
}
`.trim(),

    GASTO_FIJO: `
${baseInstruction}
Es una factura de gasto fijo (seguro, peaje, multa, gestoría, etc.).

Schema JSON:
{
  "tipo_factura": "GASTO_FIJO",
  "proveedor": "string",
  "fecha": "YYYY-MM-DD",
  "numero_factura": "string o null",
  "importe": number,
  "concepto": "string (descripción del gasto)",
  "categoria": "string (ej: SEGURO, PEAJE, MULTA, GESTORIA, AUTONOMO, OTROS)",
  "confianza": number (0-100)
}
`.trim(),
  };

  return schemas[tipo] || schemas['GASTO_FIJO'];
}

// ─────────────────────────────────────────────
// Función principal: procesar factura
// ─────────────────────────────────────────────
async function procesarFactura(buffer, mimetype, organizacionId) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada en el servidor');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel(
    { model: 'gemini-1.5-flash' },
    { apiVersion: 'v1' }
  );

  // 1. Verificar y actualizar límite de uso mensual
  const { data: org, error: orgError } = await supabase
    .from('organizaciones')
    .select('plan, ocr_usos_mes_actual, ocr_reset_fecha')
    .eq('id', organizacionId)
    .single();

  if (orgError || !org) {
    throw Object.assign(new Error('Organización no encontrada'), { statusCode: 404 });
  }

  const ahora = new Date();
  const resetFecha = org.ocr_reset_fecha ? new Date(org.ocr_reset_fecha) : null;
  let usosActuales = org.ocr_usos_mes_actual ?? 0;

  // Reset mensual automático
  const esNuevoMes =
    !resetFecha ||
    ahora.getMonth() !== resetFecha.getMonth() ||
    ahora.getFullYear() !== resetFecha.getFullYear();

  if (esNuevoMes) {
    usosActuales = 0;
    await supabase
      .from('organizaciones')
      .update({ ocr_usos_mes_actual: 0, ocr_reset_fecha: ahora.toISOString() })
      .eq('id', organizacionId);
  }

  const plan = org.plan || 'free';
  const limite = LIMITES_OCR[plan] ?? LIMITES_OCR.free;

  if (usosActuales >= limite) {
    throw Object.assign(
      new Error(`Límite de OCR mensual alcanzado: ${usosActuales}/${limite}`),
      { statusCode: 429, usos: usosActuales, limite, plan }
    );
  }

  // 2. Preparar contenido del archivo para Gemini
  const base64 = buffer.toString('base64');
  const filePart = {
    inlineData: {
      data: base64,
      mimeType: mimetype,
    },
  };

  // 3. Detección rápida del proveedor/tipo
  const detectionResult = await model.generateContent([
    filePart,
    'En una sola línea, dime el nombre del proveedor/emisor de este documento. Solo el nombre, nada más.',
  ]);
  const proveedorHint = detectionResult.response.text().trim();
  const tipoFactura = detectarTipoFactura(proveedorHint);

  console.log(`[OCR] Proveedor detectado: "${proveedorHint}" → tipo: ${tipoFactura}`);

  // 4. Extracción completa con prompt específico
  const prompt = buildPromptPorTipo(tipoFactura);
  const extractionResult = await model.generateContent([filePart, prompt]);
  const rawText = extractionResult.response.text();

  // 5. Parsear JSON de la respuesta
  let resultado;
  try {
    const clean = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    resultado = JSON.parse(clean);
  } catch (parseErr) {
    console.error('[OCR] Error parseando JSON:', rawText);
    throw new Error('Gemini no devolvió JSON válido: ' + rawText.substring(0, 200));
  }

  // 6. Incrementar contador de uso
  await supabase
    .from('organizaciones')
    .update({ ocr_usos_mes_actual: usosActuales + 1 })
    .eq('id', organizacionId);

  // 7. Registrar en log (no crítico)
  const usageMetadata = extractionResult.response.usageMetadata;
  const tokensEntrada = usageMetadata?.promptTokenCount ?? 0;
  const tokensSalida = usageMetadata?.candidatesTokenCount ?? 0;

  await supabase.from('ocr_uso_log').insert({
    organizacion_id: organizacionId,
    fecha: ahora.toISOString(),
    tipo_factura: resultado.tipo_factura ?? tipoFactura,
    proveedor: resultado.proveedor ?? proveedorHint,
    lineas_extraidas: resultado.lineas?.length ?? 1,
    tokens_entrada: tokensEntrada,
    tokens_salida: tokensSalida,
  }).catch(err => console.warn('[OCR] Error guardando log:', err.message));

  console.log(`[OCR] ✅ Procesado: ${tipoFactura} | tokens: ${tokensEntrada}+${tokensSalida} | org: ${organizacionId}`);

  return resultado;
}

// ─────────────────────────────────────────────
// Consultar uso actual de una organización
// ─────────────────────────────────────────────
async function consultarUso(organizacionId) {
  const { data: org, error } = await supabase
    .from('organizaciones')
    .select('plan, ocr_usos_mes_actual, ocr_reset_fecha')
    .eq('id', organizacionId)
    .single();

  if (error || !org) {
    throw Object.assign(new Error('Organización no encontrada'), { statusCode: 404 });
  }

  const plan = org.plan || 'free';
  const limite = LIMITES_OCR[plan] ?? LIMITES_OCR.free;
  const usos = org.ocr_usos_mes_actual ?? 0;

  return {
    usos,
    limite,
    plan,
    restantes: Math.max(0, limite - usos),
    reset_fecha: org.ocr_reset_fecha,
  };
}

module.exports = { procesarFactura, consultarUso, LIMITES_OCR };
