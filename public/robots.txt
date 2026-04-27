const PRDFILE_URL = 'https://portal.farmapazvenezuela.com/uploads/prdfile.zip';

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000;

async function obtenerProductos() {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL) return cache.data;
  const AdmZip = (await import('adm-zip')).default;
  const response = await fetch(PRDFILE_URL, { headers: { 'User-Agent': 'NaviBot/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const zip = new AdmZip(Buffer.from(arrayBuffer));
  const text = zip.getEntries()[0].getData().toString('utf8');
  const json = JSON.parse(text);
  cache = { data: json.productos || {}, timestamp: now };
  return cache.data;
}

function buscar(productos, query) {
  const terminos = query.toLowerCase().trim().split(/\s+/);
  const resultados = [];
  for (const p of Object.values(productos)) {
    const texto = [p.name || '', p.brands || '', p.sku || ''].join(' ').toLowerCase();
    if (terminos.every(t => texto.includes(t))) resultados.push(p);
  }
  return resultados.sort((a, b) => (b.stock_quantity || 0) - (a.stock_quantity || 0)).slice(0, 20);
}

function renderProducto(p) {
  const precioRegular = parseFloat(p.regular_price) || 0;
  const precioOferta = parseFloat(p.sale_price) || 0;
  const tieneDescuento = precioOferta > 0 && precioOferta < precioRegular;
  const precioFinal = tieneDescuento ? precioOferta : precioRegular;
  const conStock = (p.stock_quantity || 0) > 0;
  const sucursales = Object.values(p.stock || {})
    .filter(s => s.stock > 0)
    .map(s => s.name)
    .join(', ');

  return `<tr>
    <td>${p.name}</td>
    <td>${p.brands || '-'}</td>
    <td>$${precioFinal.toFixed(2)}${tieneDescuento ? ` <small>(reg. $${precioRegular.toFixed(2)})</small>` : ''}</td>
    <td>${conStock ? `✅ ${sucursales}` : '❌ Sin stock'}</td>
  </tr>`;
}

function renderHTML(titulo, productos, total) {
  const rows = productos.map(renderProducto).join('\n');
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${titulo}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a5276; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
    th { background: #1a5276; color: white; padding: 8px; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    tr:hover { background: #f5f5f5; }
    small { color: #888; }
    .info { color: #555; margin-bottom: 16px; }
  </style>
</head>
<body>
  <h1>Catálogo FarmaPaz</h1>
  <p class="info">${titulo} — <strong>${total}</strong> producto(s). Actualizado cada 15 minutos.</p>
  <table>
    <thead><tr><th>Producto</th><th>Marca</th><th>Precio</th><th>Disponibilidad</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <footer><p><small>FarmaPaz Venezuela. Precios en USD.</small></p></footer>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  try {
    const productos = await obtenerProductos();
    const { q } = req.query;

    if (q && q.trim().length >= 2) {
      // Búsqueda específica
      const resultados = buscar(productos, q.trim());
      return res.status(200).send(renderHTML(`Resultados para: "${q}"`, resultados, resultados.length));
    } else {
      // Todos los productos
      const todos = Object.values(productos)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return res.status(200).send(renderHTML('Catálogo completo', todos, todos.length));
    }
  } catch (error) {
    console.error('[CATALOGO ERROR]', error.message);
    return res.status(500).send(`<!DOCTYPE html><html><body><p>Error al cargar el catálogo: ${error.message}</p></body></html>`);
  }
}
