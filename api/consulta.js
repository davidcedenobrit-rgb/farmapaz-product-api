const FARMAPAZ_API = 'https://portal.farmapazvenezuela.com/API2/check_prds/';

const rateLimit = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 4;

  if (!rateLimit.has(ip)) {
    rateLimit.set(ip, { count: 1, start: now });
    return true;
  }

  const data = rateLimit.get(ip);

  if (now - data.start > windowMs) {
    rateLimit.set(ip, { count: 1, start: now });
    return true;
  }

  if (data.count >= maxRequests) return false;

  data.count++;
  return true;
}

function formatResponse(products) {
  if (!products || products.length === 0) {
    return { encontrado: false, mensaje: 'No se encontraron productos con ese nombre.' };
  }

  return {
    encontrado: true,
    total_resultados: products.length,
    productos: products.map((p) => {
      const tieneDescuento = p.sale_price && parseFloat(p.sale_price) < parseFloat(p.regular_price);

      const sucursalesConStock = Object.values(p.stock || {})
        .filter((s) => s.stock > 0)
        .sort((a, b) => b.stock - a.stock)
        .map((s) => `${s.name} (${s.stock} unid.)`);

      return {
        nombre: p.name,
        sku: p.sku,
        precio_regular: parseFloat(p.regular_price).toFixed(2),
        precio_final: parseFloat(p.sale_price).toFixed(2),
        tiene_descuento: tieneDescuento,
        stock_total: p.stock_quantity,
        sucursales_con_stock: sucursalesConStock,
        ultima_sincronizacion: p.last_sync || null,
      };
    }),
  };
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido. Usa GET.' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: 'Too Many Requests',
      mensaje: 'Has excedido el límite de peticiones. Intenta de nuevo en 1 minuto.',
      retryAfter: 60,
    });
  }

  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return res.status(400).json({
      error: 'Parámetro inválido',
      mensaje: 'El parámetro ?q= es requerido y debe tener al menos 2 caracteres.',
    });
  }

  const query = q.trim().substring(0, 100);

  try {
    const url = `${FARMAPAZ_API}?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!response.ok) {
      throw new Error(`Error al consultar Farmapaz: ${response.status}`);
    }

    const data = await response.json();
    const formatted = formatResponse(data);

    return res.status(200).json(formatted);
  } catch (error) {
    console.error('[FARMAPAZ-API] Error:', error.message);
    return res.status(502).json({
      error: 'Error al consultar la API de Farmapaz',
      mensaje: 'No se pudo obtener la información en este momento. Intenta de nuevo.',
    });
  }
}
