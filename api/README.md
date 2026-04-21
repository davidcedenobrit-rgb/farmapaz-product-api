# Farmapaz Product API

API intermediaria entre el agente IA de GHL y la API de Farmapaz Venezuela.

## Endpoint

GET /api/consulta?q={nombre_producto}

## Ejemplo

GET /api/consulta?q=ulcon

## Respuesta

```json
{
  "encontrado": true,
  "total_resultados": 2,
  "productos": [
    {
      "nombre": "ULCON 1G X 20 TAB (SUCRALFATO)",
      "sku": "7591821210288",
      "precio_regular": "16.56",
      "precio_final": "12.42",
      "tiene_descuento": true,
      "stock_total": 56,
      "sucursales_con_stock": [
        "05 AV. LUIS DEL VALLE (9 unid.)",
        "02 AV. JUNCAL (6 unid.)"
      ]
    }
  ]
}
```

## Rate Limit
4 requests por minuto por IP.
