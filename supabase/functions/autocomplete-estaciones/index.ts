import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejo de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Inicializar cliente de Supabase
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  const url = new URL(req.url)
  const query = url.searchParams.get('query') || ''

  // Solo estaciones que realmente tienen servicio en los horarios.
  const conServicio = new Set()
  for (let off = 0; off < 2400; off += 998) {
    const { data: pasos } = await supabase
      .from('trenes')
      .select('codigo_estacion')
      .range(off, off + 997);
    for (const p of pasos || []) conServicio.add(p.codigo_estacion)
  }

  // Consulta de autocompletado
  const { data, error } = await supabase
    .from('trenes_estaciones')
    .select('id, estacion')
    .ilike('estacion', `%${query}%`)
    .limit(10)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const filtradas = (data || []).filter((e) => conServicio.has(e.id)).slice(0, 5)

  return new Response(JSON.stringify(filtradas), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
