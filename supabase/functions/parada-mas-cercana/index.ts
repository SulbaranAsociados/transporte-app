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
  let destino: string | null = null
  try {
    const body = await req.json()
    lat = Number(body.lat)
    lng = Number(body.lng)
    destino = body.destino ? String(body.destino).trim() : null
  } catch {
    const url = new URL(req.url)
    lat = Number(url.searchParams.get('lat'))
    lng = Number(url.searchParams.get('lng'))
    destino = url.searchParams.get('destino')
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new Response(JSON.stringify({ error: 'Parámetros lat/lng inválidos.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: paradas, error } = await supabase
    .from('paradas')
    .select('id_parada, nombre, latitud, longitud, localidad');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Paradas que realmente tienen servicio en los horarios.
  const conServicio = new Set()
  for (let off = 0; off < 4000; off += 998) {
    const { data: pasos } = await supabase
      .from('secuencia_desfaces')
      .select('parada_id')
      .range(off, off + 997);
    for (const p of pasos || []) conServicio.add(p.parada_id)
  }

  let candidatas = (paradas || []).filter((p) => conServicio.has(p.id_parada))

  // Si se indica destino, restringimos a paradas de rutas hacia ese destino.
  if (destino) {
    const { data: rutas } = await supabase
      .from('rutas')
      .select('id_ruta')
      .eq('destino', destino)
      .limit(50)
    const rutaIds = (rutas || []).map((r) => r.id_ruta)

    if (rutaIds.length > 0) {
      const deRuta = new Set()
      for (let off = 0; off < 4000; off += 998) {
        const { data: pasos } = await supabase
          .from('secuencia_desfaces')
          .select('parada_id')
          .in('ruta_id', rutaIds)
          .range(off, off + 997);
        for (const p of pasos || []) deRuta.add(p.parada_id)
      }
      const filtradas = candidatas.filter((p) => deRuta.has(p.id_parada))
      if (filtradas.length > 0) candidatas = filtradas
    }
  }

  const a = Math.PI / 180
  const latRad = lat * a

  let masCercana: any = null
  let menorDistancia = Infinity

  for (const p of candidatas) {
    const lat2 = p.latitud * a
    const lng2 = p.longitud * a
    const dLat = lat2 - latRad
    const dLng = lng2 - lng * a
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(latRad) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
    const km = 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
    if (km < menorDistancia) {
      menorDistancia = km
      masCercana = p
    }
  }

  if (!masCercana) {
    return new Response(JSON.stringify({ error: 'No se encontró ninguna parada con servicio.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  return new Response(
    JSON.stringify({ parada: masCercana, distancia_km: Number(menorDistancia.toFixed(2)) }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});