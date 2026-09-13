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

function calendariosDeHoy(esFestivo, diaSemana) {
  const esFinDeSemana = diaSemana === 0 || diaSemana === 6
  if (esFestivo) return ['diario']
  return esFinDeSemana ? ['diario'] : ['diario', 'laborable']
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  let estacionId
  try {
    const body = await req.json()
    estacionId = (body.estacion_id || body.destino_id || '').trim()
  } catch {
    const url = new URL(req.url)
    estacionId = (url.searchParams.get('estacion_id') || url.searchParams.get('destino_id') || '').trim()
  }

  const hoy = fechaHoyLocal()
  const diaSemana = new Date(hoy + 'T12:00:00Z').getDay()

  const { data: festivos } = await supabase
    .from('festivos')
    .select('id')
    .eq('fecha', hoy)
    .eq('activo', true)

  const calendarios = calendariosDeHoy((festivos || []).length > 0, diaSemana)

  let query = supabase
    .from('trenes')
    .select('*')
    .in('calendario', calendarios)
    .order('hora_de_paso', { ascending: true })

  if (estacionId) query = query.eq('codigo_estacion', estacionId)

  const { data, error } = await query

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ found: (data || []).length > 0, trenes: data || [] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})