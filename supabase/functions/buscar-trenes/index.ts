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

  const { destino } = await req.json()
  const fechaHoy = fechaHoyLocal()
  const horaActual = horaLocal()
  const diaSemana = new Date(fechaHoy + 'T12:00:00Z').getDay()

  // 1. ¿Es festivo?
  const { data: festivo } = await supabase
    .from('festivos')
    .select('tipo_dia')
    .eq('fecha', fechaHoy)
    .single()

  // 2. Determinar calendarios activos (la tabla solo tiene diario/laborable)
  const esFinDeSemana = diaSemana === 0 || diaSemana === 6
  const calendarios = festivo
    ? ['diario']
    : (esFinDeSemana ? ['diario'] : ['diario', 'laborable'])

  // 3. Buscar trenes
  let query = supabase
    .from('trenes')
    .select('*')
    .in('calendario', calendarios)
    .gte('hora_de_paso', horaActual)
    .order('hora_de_paso', { ascending: true })

  if (destino) query = query.ilike('estacion_destino', `%${destino}%`)

  const { data: trenes, error } = await query.limit(5)

  if (error || !trenes || trenes.length === 0) {
    return new Response(JSON.stringify({ 
      found: false, 
      message: "No hay trenes disponibles. Conectando con Google Maps...",
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=estación+tren+${destino_id}`
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ found: true, trenes }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
