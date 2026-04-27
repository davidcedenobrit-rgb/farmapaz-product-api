const PRDFILE_URL = 'https://portal.farmapazvenezuela.com/uploads/prdfile.zip';
const API_KEY = 'navi-farmapaz-2026';

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000;
const rateLimit = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 20;
  if (!rateLimit.has(ip)) { rateLimit.set(ip, { count: 1, start: now }); return true; }
  const data = rateLimit.get(ip);
  if (now - data.start > windowMs) { rateLimit.set(ip, { count: 1, start: now }); return true; }
  if (data.count >= maxRequests) return false;
  data.count++;
  return true;
}

async function obtenerProductos() {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL) return cache.data;
  const response = await fetch(PRDFILE_URL, {
    headers: { 'User-Agent': 'NaviBot/1.0' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} al descargar catálogo`);
  const text = await response.text();
  const json = JSON.parse(text);
  const productos = json.productos || {};
  cache = { data: productos, timestamp: now };
  return productos;
}

function buscarProductos(productos, query) {
  const terminos = query.toLowerCase().trim().split(/\s+/);
  const resultados = [];
  for (const producto of Object.values(productos)) {
    const texto = [producto.name || '', producto.brands || '', producto.sku || ''].join(' ').toLowerCase();
    if (terminos.every((t) => texto.includes(t))) resultados.push(producto);
  }
  return resultados.sort((a, b) => (b.stock_quantity || 0) - (a.stock_quantity || 0)).slice(0, 10);
}

function formatResponse(products) {
  if (!products || products.length === 0) return { encontrado: false, mensaje: 'No se encontraron productos.' };
  return {
    encontrado: true,
    total_resultados: products.length,
    productos: products.map((p) => {
      const precioRegular = parseFloat(p.regular_price) || 0;
      const precioOferta = parseFloat(p.sale_price) || 0;
      const tieneDescuento = precioOferta > 0 && precioOferta < precioRegular;
      const sucursalesConStock = Object.values(p.stock || {})
        .filter((s) => s.stock > 0)
        .sort((a, b) => b.stock - a.stock)
        .map((s) => `${s.name} (${s.stock} unid.)`);
      return {
        nombre: p.name,
        sku: p.sku,
        marca: p.brands || null,
        precio_regular: precioRegular.toFixed(2),
        precio_final: tieneDescuento ? precioOferta.toFixed(2) : precioRegular.toFixed(2),
        tiene_descuento: tieneDescuento,
        stock_total: p.stock_quantity || 0,
        sucursales_con_stock: sucursalesConStock,
      };
    }),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Solo GET.' });
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (apiKey !== API_KEY) return res.status(401).json({ error: 'API key inválida.' });
  const ip = req.headers['x-forwarded-for'] || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too Many Requests.' });
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Parámetro ?q= requerido (mín. 2 caracteres).' });
  try {
    const productos = await obtenerProductos();
    const resultados = buscarProductos(productos, q.trim().substring(0, 100));
    return res.status(200).json(formatResponse(resultados));
  } catch (error) {
    console.error('[ERROR]', error.message);
    return res.status(502).json({ error: 'Error al consultar el catálogo.', detalle: error.message });
  }
}
