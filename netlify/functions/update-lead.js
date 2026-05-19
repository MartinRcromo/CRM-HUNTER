// netlify/functions/update-lead.js
// Sin dependencias externas — usa fetch nativo de Node 18+

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Access-Control-Allow-Methods': 'PATCH, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (!['PATCH', 'POST'].includes(event.httpMethod)) {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Variables de entorno no configuradas' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    if (!body.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Se requiere ID del lead' }) };

    const hoy = new Date().toISOString().split('T')[0];

    // Obtener lead actual
    const getRes = await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${body.id}&select=historial,estado,hunter_id`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const current = await getRes.json();
    if (!current || !current[0]) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lead no encontrado' }) };

    let historial = [];
    try { historial = JSON.parse(current[0].historial || '[]'); } catch {}

    const updates = {};

    if (body.estado && body.estado !== current[0].estado) {
      updates.estado = body.estado;
      historial.push({ a: 'Cambio de estado', d: `${current[0].estado} → ${body.estado}`, f: hoy });
      if (body.estado === 'Dado de alta') updates.fecha_alta = hoy;
      if (body.estado === 'Activado')      updates.fecha_traspaso = hoy;
    }
    if (body.hunter_id) {
      updates.hunter_id    = body.hunter_id;
      updates.hunter_nombre = body.hunter_nombre || '';
      historial.push({ a: 'Hunter asignado', d: body.hunter_nombre || body.hunter_id, f: hoy });
    }
    if (body.activador_id) {
      updates.activador_id    = body.activador_id;
      updates.activador_nombre = body.activador_nombre || '';
      updates.fecha_traspaso  = hoy;
      historial.push({ a: '🔄 Traspasado a Activador', d: `Activador: ${body.activador_nombre || body.activador_id}`, f: hoy });
    }
    if (body.nota) {
      historial.push({ a: '🎓 Interacción', d: body.nota, f: hoy });
    }
    if (body.monto)         updates.monto = body.monto;
    if (body.observaciones) updates.observaciones = body.observaciones;

    updates.historial  = JSON.stringify(historial);
    updates.updated_at = new Date().toISOString();

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${body.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(updates)
    });

    const data = await patchRes.json();
    if (!patchRes.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error al actualizar', detail: data }) };

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Lead actualizado', lead: data[0] }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Error interno', detail: err.message }) };
  }
};
