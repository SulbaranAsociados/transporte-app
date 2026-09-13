import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ZONA_HORARIA = 'Europe/Madrid'

function fechaHoyLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function horaLocal() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(/^24:/, '00:')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  let cuerpo
  try {
    cuerpo = await req.json()
  } catch {
    cuerpo = {}
    const url = new URL(req.url)
    url.searchParams.forEach((v, k) => (cuerpo[k] = v))
  }
  const origen = String(cuerpo.origen || cuerpo.origen_id || '').trim()
  const destinoId = String(cuerpo.destino_id || '').trim()
  const destino = String(cuerpo.destino || '').trim()

  const hoy = fechaHoyLocal()
  const horaActual = horaLocal()
  const diaSemana = new Date(hoy + 'T12:00:00Z').getDay()

  const { data: festivos } = await supabase
    .from('festivos')
    .select('id')
    .eq('fecha', hoy)
    .eq('activo', true)

  const esFinDeSemana = diaSemana === 0 || diaSemana === 6
  const calendarios = (festivos || []).length > 0
    ? ['diario']
    : (esFinDeSemana ? ['diario'] : ['diario', 'laborable'])

  const respuesta = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  // Buscar trenes que PAREN en la estación destino (no que finalicen ahí).
  const destinoQuery = destinoId
    ? supabase
        .from('trenes')
        .select('numero_tren, hora_de_paso')
        .eq('codigo_estacion', destinoId)
        .in('calendario', calendarios)
        .gte('hora_de_paso', horaActual)
        .order('hora_de_paso', { ascending: true })
    : supabase
        .from('trenes')
        .select('numero_tren, hora_de_paso')
        .eq('codigo_estacion', origen)
        .in('calendario', calendarios)
        .gte('hora_de_paso', horaActual)
        .ilike('estacion_destino', `%${destino}%`)
        .order('hora_de_paso', { ascending: true })

  const { data: pasanPorDestino, error: errDest } = await destinoQuery
  if (errDest) return respuesta({ error: errDest.message }, 400)

  // Sin destino_id: el modo antiguo (destino final) ya está resuelto.
  if (!destinoId) {
    const { data, error } = await destinoQuery
    if (error) return respuesta({ error: error.message }, 400)
    return respuesta({ found: data.length > 0, trenes: data, origen, destino })
  }

  const numeroTrenes = [...new Set((pasanPorDestino || []).map((t) => t.numero_tren))]

  if (numeroTrenes.length === 0) {
    return respuesta({ found: false, trenes: [], origen, destino })
  }

  // Para esos trenes, ver cuándo salen del origen.
  const { data: porOrigen, error: errOrigen } = await supabase
    .from('trenes')
    .select('numero_tren, codigo_estacion, hora_de_paso')
    .eq('codigo_estacion', origen)
    .in('numero_tren', numeroTrenes)
    .in('calendario', calendarios)

  if (errOrigen) return respuesta({ error: errOrigen.message }, 400)

  // Map: numero_tren -> hora (HH:MM) a la que pasa por el ORIGEN
  const salidaPorTren = new Map()
  for (const t of porOrigen || []) {
    const salida = String(t.hora_de_paso).substring(0, 5)
    if (!salidaPorTren.has(t.numero_tren) || salida < salidaPorTren.get(t.numero_tren)) {
      salidaPorTren.set(t.numero_tren, salida)
    }
  }

  const trenes = []
  for (const t of pasanPorDestino || []) {
    const llegada = String(t.hora_de_paso).substring(0, 5)
    const salida = salidaPorTren.get(t.numero_tren)
    // Solo trenes aprovechables por el usuario:
    //  - paran en el origen (hay salida),
    //  - la salida es futura (puede subir),
    //  - pasan por el origen ANTES que por el destino (dirección correcta).
    if (!salida || salida < horaActual || llegada <= salida) continue
    trenes.push({
      numero_tren: t.numero_tren,
      destino,
      salida,
      llegada,
      hora_de_paso: t.hora_de_paso,
    })
  }

  trenes.sort((a, b) => (a.salida < b.salida ? -1 : a.salida > b.salida ? 1 : 0))

  return respuesta({ found: trenes.length > 0, trenes, origen, destino })
})