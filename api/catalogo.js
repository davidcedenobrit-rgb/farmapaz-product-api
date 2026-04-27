const PRDFILE_URL = 'https://portal.farmapazvenezuela.com/uploads/prdfile.zip';

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000;

async function obtenerProductos() {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL) return cache.data;
  const response = await fetch(PRDFILE_URL, { headers: { 'User-Agent': 'NaviBot/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const AdmZip = (await import('adm-zip')).default;
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
  return resultados.sort((a, b) => (b.stock_quantity || 0) - (a.stock_quantity || 0)).slice(0, 15);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(200).send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Catálogo FarmaPaz</title></head>
<body>
<h1>Catálogo FarmaPaz</h1>
<p>Bienvenido al catálogo de FarmaPaz. Use el parámetro ?q= para buscar productos.</p>
<p>Ejemplo: /api/catalogo?q=aspirina</p>
</body></html>`);
  }

  try {
    const productos = await obtenerProductos();
    const resultados = buscar(productos, q.trim());

    const items = resultados.map(p => {
      const precioRegular = parseFloat(p.regular_price) || 0;
      const precioOferta = parseFloat(p.sale_price) || 0;
      const tieneDescuento = precioOferta > 0 && precioOferta < precioRegular;
      const precioFinal = tieneDescuento ? precioOferta : precioRegular;

      const sucursales = Object.values(p.stock || {})
        .filter(s => s.stock > 0)
        .sort((a, b) => b.stock - a.stock)
        .map(s => `${s.name}: ${s.stock} unidades`)
        .join(', ');

      return `
<div class="producto">
  <h2>${p.name}</h2>
  <p><strong>SKU:</strong> ${p.sku}</p>
  <p><strong>Marca:</strong> ${p.brands || 'No especificada'}</p>
  <p><strong>Precio regular:</strong> $${precioRegular.toFixed(2)}</p>
  <p><strong>Precio final:</strong> $${precioFinal.toFixed(2)}${tieneDescuento ? ' (con descuento)' : ''}</p>
  <p><strong>Stock total:</strong> ${p.stock_quantity || 0} unidades</p>
  <p><strong>Disponible en:</strong> ${sucursales || 'Sin stock en sucursales'}</p>
  <p><strong>Categorías:</strong> ${(p.categories || []).join(', ') || 'Sin categoría'}</p>
</div>`;
    }).join('\n<hr>\n');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Catálogo FarmaPaz - ${q}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a5276; }
    .producto { background: #f9f9f9; padding: 16px; margin: 16px 0; border-radius: 8px; border-left: 4px solid #1a5276; }
    h2 { color: #1a5276; margin-top: 0; font-size: 1.1em; }
    p { margin: 4px 0; font-size: 0.95em; }
    .sin-resultados { color: #888; font-style: italic; }
    hr { border: none; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <h1>FarmaPaz - Resultados para: "${q}"</h1>
  <p>Se encontraron <strong>${resultados.length}</strong> producto(s).</p>
  ${resultados.length > 0 ? items : '<p class="sin-resultados">No se encontraron productos para esta búsqueda.</p>'}
  <footer>
    <p><small>Catálogo actualizado cada 15 minutos. Precios en USD.</small></p>
  </footer>
</body>
</html>`;

    return res.status(200).send(html);
  } catch (error) {
    console.error('[CATALOGO ERROR]', error.message);
    return res.status(500).send(`<!DOCTYPE html>
<html><body><p>Error al cargar el catálogo. Intente nuevamente.</p></body></html>`);
  }
}
