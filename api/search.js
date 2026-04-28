const PRDFILE_URL = 'https://portal.farmapazvenezuela.com/uploads/prdfile.zip';

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000;

async function obtenerProductos() {
  const now = Date.now();

  if (cache.data && now - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  const AdmZip = (await import('adm-zip')).default;

  const response = await fetch(PRDFILE_URL, {
    headers: {
      'User-Agent': 'NaviBot/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const zip = new AdmZip(Buffer.from(arrayBuffer));
  const text = zip.getEntries()[0].getData().toString('utf8');
  const json = JSON.parse(text);

  cache = {
    data: json.productos || {},
    timestamp: now
  };

  return cache.data;
}

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function buscar(productos, query, limit = 5) {
  const terminos = normalizar(query)
    .split(/\s+/)
    .filter(Boolean);

  const resultados = [];

  for (const p of Object.values(productos)) {
    const texto = normalizar([
      p.name || '',
      p.brands || '',
      p.sku || ''
    ].join(' '));

    const coincide = terminos.every(t => texto.includes(t));

    if (coincide) {
      resultados.push(p);
    }
  }

  return resultados
    .sort((a, b) => (b.stock_quantity || 0) - (a.stock_quantity || 0))
    .slice(0, Number(limit));
}

function formatearProducto(p) {
  const precioRegular = parseFloat(p.regular_price) || 0;
  const precioOferta = parseFloat(p.sale_price) || 0;
  const tieneDescuento = precioOferta > 0 && precioOferta < precioRegular;
  const precioFinal = tieneDescuento ? precioOferta : precioRegular;

  const sucursales = Object.values(p.stock || {})
    .filter(s => Number(s.stock || 0) > 0)
    .map(s => ({
      nombre: s.name,
      stock: s.stock
    }));

  const disponible = sucursales.length > 0;

  return {
    sku: p.sku || '',
    producto: p.name || 'Producto sin nombre',
    marca: p.brands || '',
    precio: precioFinal > 0 ? Number(precioFinal.toFixed(2)) : null,
    precio_regular: precioRegular > 0 ? Number(precioRegular.toFixed(2)) : null,
    precio_oferta: precioOferta > 0 ? Number(precioOferta.toFixed(2)) : null,
    tiene_descuento: tieneDescuento,
    disponible,
    stock_total: p.stock_quantity || 0,
    sucursales
  };
}

function generarRespuesta(query, productos) {
  if (!productos.length) {
    return `Por ahora no me aparece "${query}" confirmado en el catálogo. Puedo pasarte con un asesor para verificar disponibilidad.`;
  }

  let respuesta = `Sí, encontré estas opciones para "${query}":\n\n`;

  productos.forEach((p, index) => {
    respuesta += `${index + 1}. ${p.producto}\n`;

    if (p.marca) {
      respuesta += `Marca: ${p.marca}\n`;
    }

    respuesta += `Precio: ${p.precio ? `$${p.precio}` : 'Consultar'}\n`;

    if (p.disponible) {
      const sedes = p.sucursales
        .slice(0, 6)
        .map(s => s.nombre)
        .join(', ');

      respuesta += `Disponible en: ${sedes}\n`;
    } else {
      respuesta += `Disponibilidad: Sin stock confirmado\n`;
    }

    respuesta += `\n`;
  });

  respuesta += `¿En qué sede deseas retirarlo o quieres que te pase con un asesor?`;

  return respuesta;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const { q = '', limit = 5 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        ok: false,
        query: q,
        total: 0,
        respuesta: 'Por favor indícame el nombre del producto que deseas consultar.',
        resultados: []
      });
    }

    const productos = await obtenerProductos();
    const encontrados = buscar(productos, q, limit);
    const resultados = encontrados.map(formatearProducto);
    const respuesta = generarRespuesta(q, resultados);

    return res.status(200).json({
      ok: true,
      query: q,
      total: resultados.length,
      respuesta,
      resultados
    });
  } catch (error) {
    console.error('[SEARCH ERROR]', error.message);

    return res.status(500).json({
      ok: false,
      query: req.query.q || '',
      total: 0,
      respuesta: 'En este momento no pude consultar el catálogo. Puedo pasarte con un asesor para verificarlo.',
      error: error.message,
      resultados: []
    });
  }
}
