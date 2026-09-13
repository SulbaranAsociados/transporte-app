import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  let numeroTren
  let origenId
  let destinoId
  let destino
  try {
    const body = await req.json()
    numeroTren = (body.numero_tren || '').trim()
    origenId = (body.origen_id || '').trim() || (body.origen || '').trim()
    destinoId = (body.destino_id || '').trim()
    destino = (body.destino || '').trim()
  } catch {
    const url = new URL(req.url)
    numeroTren = (url.searchParams.get('numero_tren') || '').trim()
    origenId = (url.searchParams.get('origen_id') || url.searchParams.get('origen') || '').trim()
    destinoId = (url.searchParams.get('destino_id') || '').trim()
    destino = (url.searchParams.get('destino') || '').trim()
  }

  if (!numeroTren || !origenId) {
    return new Response(JSON.stringify({ error: 'Faltan numero_tren u origen_id.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Solo servicios que circulan hoy (misma lógica que el resto de funciones).
  const diaSemana = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Madrid' }).format(new Date()).toLowerCase()
  const fechaLocal = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const { data: festivos } = await supabase.from('festivos').select('fecha').eq('fecha', fechaLocal)
  const esFestivo = (festivos || []).length > 0
  const calendarios = diaSemana === 'sat' || diaSemana === 'sun' || esFestivo ? ['diario'] : ['diario', 'laborable']

  const { data: estaciones, error: errEst } = await supabase
    .from('trenes_estaciones')
    .select('id, estacion')

  if (errEst) {
    return new Response(JSON.stringify({ error: errEst.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const nombrePorId = Object.fromEntries((estaciones || []).map((e) => [e.id, e.estacion]))

  const { data: tramos, error } = await supabase
    .from('trenes')
    .select('codigo_estacion, hora_de_paso, estacion_destino')
    .eq('numero_tren', numeroTren)
    .in('calendario', calendarios)
    .order('hora_de_paso', { ascending: true, nullsFirst: false })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const vistos = new Set()
  const sinDup = (tramos || []).filter((t) => {
    const clave = `${t.codigo_estacion}|${t.hora_de_paso}`
    if (vistos.has(clave)) return false
    vistos.add(clave)
    return true
  })

  const inicio = sinDup.findIndex((t) => t.codigo_estacion === origenId)
  if (inicio === -1) {
    return new Response(JSON.stringify({ error: 'La estación de origen no forma parte de la ruta de este tren.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Parar en el destino elegido por el usuario si forma parte de la ruta.
  let fin = sinDup.length - 1
  if (destinoId) {
    const idx = sinDup.findIndex((t) => t.codigo_estacion === destinoId)
    if (idx >= inicio) fin = idx
  } else if (destino) {
    const idx = sinDup.findIndex((t) => (nombrePorId[t.codigo_estacion] || '').toLowerCase() === destino.toLowerCase())
    if (idx >= inicio) fin = idx
  }

  const paradas = sinDup.slice(inicio, fin + 1).map((t) => ({
    codigo_estacion: t.codigo_estacion,
    estacion: nombrePorId[t.codigo_estacion] || t.codigo_estacion,
    hora: t.hora_de_paso ? String(t.hora_de_paso).substring(0, 5) : '',
    destino: t.estacion_destino,
  }))

  return new Response(JSON.stringify({ numero_tren: numeroTren, paradas }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})