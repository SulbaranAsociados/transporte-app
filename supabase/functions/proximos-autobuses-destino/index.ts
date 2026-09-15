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

  let lat, lng, destino
  try {
    const body = await req.json()
    lat = Number(body.lat)
    lng = Number(body.lng)
    destino = (body.destino || '').trim()
  } catch {
    const url = new URL(req.url)
    lat = Number(url.searchParams.get('lat'))
    lng = Number(url.searchParams.get('lng'))
    destino = (url.searchParams.get('destino') || '').trim()
  }

  if (!lat || !lng || !destino) {
    return new Response(JSON.stringify({ error: 'lat, lng, y destino son requeridos' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Obtenemos hora, fecha y dia semana
  const ZONA_HORARIA = 'Europe/Madrid'
  const now = new Date()
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false }).format(now).replace(/^24:/, '00:')
  const [hh, mm] = h.split(':').map(Number)
  const ahoraMins = hh * 60 + mm
  const diaSemanaIdx = now.getDay() // 0 = domingo, 1 = lunes...

  // Llamamos al RPC
  const { data, error } = await supabase.rpc('get_next_buses_for_destination', {
    user_lat: lat,
    user_lng: lng,
    target_destination: destino,
    current_time_mins: ahoraMins,
    today: hoy,
    dia_semana_idx: diaSemanaIdx
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
