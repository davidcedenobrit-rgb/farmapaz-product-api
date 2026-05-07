import AdmZip from 'adm-zip';

const PRDFILE_URL = 'https://portal.farmapazvenezuela.com/uploads/prdfile.zip';
const API_KEY = 'navi-farmapaz-2026';

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000;

async function obtenerProductos() {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL) return cache.data;
  const response = await fetch(PRDFILE_URL, {
    headers: { 'User-Agent': 'NaviBot/1.0' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} al descargar catálogo`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries()[0];
  const text = entry.getData().toString('utf8');
  const json = JSON.parse(text);
  const productos = json.productos || {};
  cache = { data: productos, timestamp: now };
  return productos;
}

const STOPWORDS = new Set([
  'tienen','tienes','tiene','hay','busco','busca','necesito','necesita',
  'quiero','quiere','precio','costo','cuesta','cuanto','cuánto',
  'disponible','disponibilidad','existencia','stock','conseguir',
  'hola','buenas','buenos','dias','días','tardes','noches',
  'por','favor','porfavor','para','con','sin','del','los','las',
  'una','uno','unos','unas','ese','esa','eso','que','qué',
  'si','sí','no','de','en','el','la','un','y','o','a','como',
  'tiene','algún','algun','alguna','algo','me','te','le','se',
  'tengan','teneis','teneís','venden','vende','hay','habra',
  'donde','dónde','cuando','cuándo','como','cómo','cual','cuál'
]);

function limpiarQuery(query) {
  return query
    .toLowerCase()
    .replace(/[¿?¡!.,;:()\[\]"']/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
    .join(' ')
    .trim();
}

function buscarProductos(productos, query) {
  const queryLimpio = limpiarQuery(query);
  if (!queryLimpio) return [];
  const terminos = queryLimpio.split(/\s+/);
  const resultados = [];
  for (const producto of Object.values(productos)) {
    const texto = [producto.name || '', producto.brands || '', producto.sku || ''].join(' ').toLowerCase();
    if (terminos.every((t) => texto.includes(t))) resultados.push(producto);
  }
  return resultados
    .sort((a, b) => (b.stock_quantity || 0) - (a.stock_quantity || 0))
    .slice(0, 5);
}

function formatearParaGHL(productos, query) {
  if (!productos || productos.length === 0) {
    return {
      success: true,
      found: false,
      message: `No encontré resultados para "${query}". ¿Puedes darme más detalles? Por ejemplo: nombre completo, presentación, marca o miligramaje.`,
      product_name: null,
      price: null,
      stock: 0,
      branch: null,
    };
  }

  const p = productos[0];
  const precioRegular = parseFloat(p.regular_price) || 0;
  const precioOferta = parseFloat(p.sale_price) || 0;
  const tieneDescuento = precioOferta > 0 && precioOferta < precioRegular;
  const precioFinal = tieneDescuento ? precioOferta : precioRegular;

  // Sucursal con más stock
  const sucursales = Object.values(p.stock || {})
    .filter((s) => s.stock > 0)
    .sort((a, b) => b.stock - a.stock);

  const sucursalTop = sucursales.length > 0 ? sucursales[0].name : null;
  const stockTotal = p.stock_quantity || 0;

  // Construir mensaje listo para enviar al cliente
  let mensaje = `✅ *${p.name}*\n`;
  if (p.brands) mensaje += `Marca: ${p.brands}\n`;
  mensaje += `💰 Precio: $${precioFinal.toFixed(2)}`;
  if (tieneDescuento) mensaje += ` ~~$${precioRegular.toFixed(2)}~~`;
  mensaje += `\n📦 Stock disponible: ${stockTotal} unidades`;
  if (sucursalTop) mensaje += `\n📍 Mayor disponibilidad: ${sucursalTop}`;

  // Si hay más de un resultado, mencionarlo
  if (productos.length > 1) {
    mensaje += `\n\n_También encontré ${productos.length - 1} producto(s) similar(es). ¿Quieres que te los muestre?_`;
  }

  return {
    success: true,
    found: true,
    message: mensaje,
    product_name: p.name,
    price: precioFinal.toFixed(2),
    stock: stockTotal,
    branch: sucursalTop,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Método no permitido.' });

  // Validar API key
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) return res.status(401).json({ success: false, message: 'API key inválida.' });

  // Extraer el mensaje del body
  const { message, contact_id, phone } = req.body || {};
  const query = (message || '').trim();

  if (!query || query.length < 2) {
    return res.status(400).json({
      success: false,
      found: false,
      message: 'No recibí una consulta válida. Por favor escríbeme el nombre del producto que buscas.',
    });
  }

  try {
    const productos = await obtenerProductos();
    const resultados = buscarProductos(productos, query.substring(0, 100));
    const respuesta = formatearParaGHL(resultados, query);
    return res.status(200).json(respuesta);
  } catch (error) {
    console.error('[ERROR consulta-ghl]', error.message);
    return res.status(200).json({
      success: false,
      found: false,
      message: 'En este momento no pude consultar el sistema. Un asesor te ayudará en breve.',
      error_detail: error.message,
    });
  }
}
