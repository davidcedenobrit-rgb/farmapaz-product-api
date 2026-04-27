} catch (error) {
    console.error('[FARMAPAZ-API] Error detalle:', error.message, error.stack);
    return res.status(502).json({
      error: 'Error al consultar el catálogo',
      mensaje: error.message,
    });
  }
