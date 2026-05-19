// netlify/functions/get-leads.js
// El CRM consulta leads nuevos desde Supabase
// Soporta filtros por estado, fecha, hunter, campaña

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  try {
    const params = event.queryStringParameters || {};

    // Construir query base
    let query = supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    // Filtros opcionales
    if (params.estado) {
      query = query.eq('estado', params.estado);
    }
    if (params.hunter_id) {
      query = query.eq('hunter_id', params.hunter_id);
    }
    if (params.campana) {
      query = query.ilike('campana', `%${params.campana}%`);
    }
    if (params.origen) {
      query = query.eq('origen', params.origen);
    }
    if (params.desde) {
      // Solo leads nuevos desde una fecha — útil para polling
      query = query.gte('created_at', params.desde);
    }
    if (params.sin_gestionar === 'true') {
      query = query.eq('estado', 'Sin gestionar');
    }

    // Paginación
    const limit  = parseInt(params.limit  || '100');
    const offset = parseInt(params.offset || '0');
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Error al consultar base de datos', detail: error.message })
      };
    }

    // Parsear historial de string a array
    const leads = (data || []).map(lead => ({
      ...lead,
      historial: (() => {
        try { return JSON.parse(lead.historial || '[]'); }
        catch { return []; }
      })(),
      seg_venta: lead.seg_venta ? lead.seg_venta.split(', ').filter(Boolean) : [],
      seg_marcas: lead.seg_marcas ? lead.seg_marcas.split(', ').filter(Boolean) : [],
    }));

    // Estadísticas rápidas
    const stats = {
      total:          leads.length,
      sin_gestionar:  leads.filter(l => l.estado === 'Sin gestionar').length,
      nuevos_hoy:     leads.filter(l => l.created_at?.startsWith(new Date().toISOString().split('T')[0])).length,
      por_campana:    {},
      por_origen:     {},
    };
    leads.forEach(l => {
      if (l.campana) stats.por_campana[l.campana] = (stats.por_campana[l.campana] || 0) + 1;
      if (l.origen)  stats.por_origen[l.origen]   = (stats.por_origen[l.origen]   || 0) + 1;
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, leads, stats, total: leads.length })
    };

  } catch (err) {
    console.error('Error inesperado:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error interno del servidor', detail: err.message })
    };
  }
};
