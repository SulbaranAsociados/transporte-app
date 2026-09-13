import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  let lat: number
  let lng: number
  try {
    const body = await req.json()
    lat = Number(body.lat)
    lng = Number(body.lng)
  } catch {
    const url = new URL(req.url)
    lat = Number(url.searchParams.get('lat'))
    lng = Number(url.searchParams.get('lng'))
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new Response(JSON.stringify({ error: 'Parámetros lat/lng inválidos.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: estaciones, error } = await supabase
    .from('trenes_estaciones')
    .select('id, estacion, latitud, longitud');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Solo estaciones que realmente tienen servicio en los horarios.
  const conServicio = new Set()
  for (let off = 0; off < 2400; off += 998) {
    const { data: pasos } = await supabase
      .from('trenes')
      .select('codigo_estacion')
      .range(off, off + 997);
    for (const p of pasos || []) conServicio.add(p.codigo_estacion)
  }
  const conTrenes = (estaciones || []).filter((e) => conServicio.has(e.id))

  const a = Math.PI / 180
  const latRad = lat * a

  let masCercana: any = null
  let menorDistancia = Infinity

  for (const e of conTrenes) {
    const lat2 = e.latitud * a
    const lng2 = e.longitud * a
    const dLat = lat2 - latRad
    const dLng = lng2 - lng * a
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(latRad) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    const km = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
    if (km < menorDistancia) {
      menorDistancia = km
      masCercana = e
    }
  }

  return new Response(
    JSON.stringify({ estacion: masCercana, distancia_km: Number(menorDistancia.toFixed(2)) }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});