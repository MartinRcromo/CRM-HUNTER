// netlify/functions/update-lead.js
// Actualiza estado de un lead, asigna Hunter, registra historial
// Llamado desde el CRM cuando el operador mueve un lead o lo asigna

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'PATCH, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!['PATCH', 'POST'].includes(event.httpMethod)) {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    if (!body.id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Se requiere el ID del lead' }) };
    }

    // Obtener lead actual para conservar historial
    const { data: current, error: fetchError } = await supabase
      .from('leads')
      .select('historial, estado, hunter_id')
      .eq('id', body.id)
      .single();

    if (fetchError || !current) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lead no encontrado' }) };
    }

    // Parsear historial existente
    let historial = [];
    try { historial = JSON.parse(current.historial || '[]'); } catch {}

    // Construir entrada de historial
    const hoy = new Date().toISOString().split('T')[0];
    const updates = {};

    if (body.estado && body.estado !== current.estado) {
      updates.estado = body.estado;
      historial.push({
        accion: 'Cambio de estado',
        detalle: `${current.estado} → ${body.estado}`,
        fecha: hoy,
        usuario: body.usuario || 'CRM'
      });

      // Fechas automáticas por estado
      if (body.estado === 'Dado de alta') updates.fecha_alta = hoy;
      if (body.estado === 'Activado')      updates.fecha_traspaso = hoy;
    }

    if (body.hunter_id && body.hunter_id !== current.hunter_id) {
      updates.hunter_id    = body.hunter_id;
      updates.hunter_nombre = body.hunter_nombre || '';
      historial.push({
        accion: 'Hunter asignado',
        detalle: body.hunter_nombre || body.hunter_id,
        fecha: hoy,
        usuario: body.usuario || 'CRM'
      });
    }

    if (body.activador_id) {
      updates.activador_id    = body.activador_id;
      updates.activador_nombre = body.activador_nombre || '';
      updates.fecha_traspaso  = hoy;
      historial.push({
        accion: '🔄 Traspasado a Activador',
        detalle: `Activador: ${body.activador_nombre || body.activador_id}${body.notas_traspaso ? ' — ' + body.notas_traspaso : ''}`,
        fecha: hoy,
        usuario: body.usuario || 'CRM'
      });
    }

    if (body.nota) {
      historial.push({
        accion: '🎓 Interacción registrada',
        detalle: body.nota,
        fecha: hoy,
        usuario: body.usuario || 'CRM'
      });
      updates.capacitaciones = (body.capacitaciones_actuales || 0) + 1;
    }

    if (body.monto) {
      updates.monto = body.monto;
    }

    if (body.observaciones) {
      updates.observaciones = body.observaciones;
    }

    // Actualizar historial serializado
    updates.historial   = JSON.stringify(historial);
    updates.updated_at  = new Date().toISOString();

    // Aplicar actualización
    const { data, error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Error al actualizar', detail: error.message })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Lead actualizado',
        lead: { ...data, historial }
      })
    };

  } catch (err) {
    console.error('Error inesperado:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno', detail: err.message })
    };
  }
};
