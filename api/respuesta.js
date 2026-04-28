const PRDFILE_URL = 'https://portal.farmapazvenezuela.com/uploads/prdfile.zip';
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000;

async function obtenerProductos() {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL) return cache.data;
  const AdmZip = (await import('adm-zip')).default;
  const response = await fetch(PRDFILE_URL, { headers: { 'User-Agent': 'NaviBot/1.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
  const json = JSON.parse(zip.getEntries()[0].getData().toString('utf8'));
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
  return resultados.sort((a, b) => (b.stock_quantity || 0) - (a.stock_quantity || 0)).slice(0, 5);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(200).send('Por favor indica el nombre del producto que buscas.');
  }

  try {
    const productos = await obtenerProductos();
    const resultados = buscar(productos, q.trim());

    if (resultados.length === 0) {
      return res.status(200).send(`No encontré productos para "${q}". ¿Puedes intentar con otro nombre o marca?`);
    }

    const lineas = resultados.map((p, i) => {
      const precioRegular = parseFloat(p.regular_price) || 0;
      const precioOferta = parseFloat(p.sale_price) || 0;
      const tieneDescuento = precioOferta > 0 && precioOferta < precioRegular;
      const precioFinal = tieneDescuento ? precioOferta : precioRegular;
      const conStock = (p.stock_quantity || 0) > 0;
      const sucursales = Object.values(p.stock || {})
        .filter(s => s.stock > 0).map(s => s.name).slice(0, 3).join(', ');

      return `${i + 1}. *${p.name}*
   💊 Marca: ${p.brands || 'N/A'}
   💲 Precio: $${precioFinal.toFixed(2)}${tieneDescuento ? ` _(regular $${precioRegular.toFixed(2)})_` : ''}
   📦 ${conStock ? `Disponible en: ${sucursales}` : 'Sin stock actualmente'}`;
    });

    const mensaje = `🔍 Resultados para *"${q}"*:\n\n${lineas.join('\n\n')}\n\n_Precios en USD. Actualizado cada 15 min._`;
    return res.status(200).send(mensaje);
  } catch (error) {
    return res.status(200).send('Hubo un error al consultar el catálogo. Por favor intenta nuevamente.');
  }
}
