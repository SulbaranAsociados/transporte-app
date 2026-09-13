import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ANUALES = ['anual_lab', 'anual_sab', 'anual_dom_fest']
const ZONA_HORARIA = 'Europe/Madrid'

function fechaHoyLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function horaEnMinutosLocal() {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(/^24:/, '00:')
  const [hh, mm] = h.split(':').map(Number)
  return hh * 60 + mm
}

function calcularDiaActual() {
  const hoy = fechaHoyLocal()
  return { hoy, diaSemana: new Date(hoy + 'T12:00:00Z').getDay() }
}

function getCalendariosActivos(calendarios, festivo) {
  const { hoy, diaSemana } = calcularDiaActual()
  const banderas = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

  return calendarios
    .filter((c) => {
      if (festivo && ANUALES.includes(c.id)) {
        return c.id === 'anual_dom_fest'
      }
      const coincideDia = c[banderas[diaSemana]] === true
      if (!coincideDia) return false
      if (ANUALES.includes(c.id)) return true
      return c.fecha_inicio <= hoy && c.fecha_fin >= hoy
    })
    .map((c) => c.id)
}

function aMinutos(hm) {
  if (!hm) return 0
  const [h, m] = hm.split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

const json = (cuerpo, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

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
    return json({ error: 'Parámetros lat/lng inválidos.' }, 400)
  }

  const { data: paradas, error } = await supabase
    .from('paradas')
    .select('id_parada, nombre, latitud, longitud, localidad');

  if (error) return json({ error: error.message }, 500)

  const paradasInfo = new Map()
  for (const p of paradas || []) {
    if (p.latitud != null && p.longitud != null) paradasInfo.set(p.id_parada, p)
  }

  if (!destino) {
    // Sin destino: la parada con servicio más cercana al usuario.
    let masCercana: any = null
    let menorDistancia = Infinity

    for (const p of paradasInfo.values()) {
      const d = distanciaKm(lat, lng, Number(p.latitud), Number(p.longitud))
      if (d < menorDistancia) {
        menorDistancia = d
        masCercana = p
      }
    }

    if (!masCercana) return json({ error: 'No se encontró ninguna parada.' }, 404)
    return json({ parada: masCercana, distancia_km: Number(menorDistancia.toFixed(2)) })
  }

  // Con destino: solo paradas por donde va a pasar un autobús hacia el destino hoy.
  const { hoy } = calcularDiaActual()
  const ahoraMins = horaEnMinutosLocal()

  // ¿Festivo hoy?
  const { data: festivos, error: errFestivos } = await supabase
    .from('festivos')
    .select('id')
    .eq('fecha', hoy)
    .eq('activo', true)
  if (errFestivos) return json({ error: errFestivos.message }, 400)
  const esFestivo = (festivos || []).length > 0

  // Calendarios activos hoy
  const { data: calendarios, error: errCal } = await supabase
    .from('calendario')
    .select('*')
  if (errCal) return json({ error: errCal.message }, 400)
  const activos = getCalendariosActivos(calendarios || [], esFestivo)

  // Rutas hacia el destino
  const { data: rutas, error: errRutas } = await supabase
    .from('rutas')
    .select('id_ruta')
    .eq('destino', destino)
    .limit(50)
  if (errRutas) return json({ error: errRutas.message }, 400)
  const rutaIds = (rutas || []).map((r) => r.id_ruta)

  if (rutaIds.length === 0) {
    return json({ error: `No hay servicio hacia ${destino}.` }, 404)
  }

  // Salidas de hoy según calendario
  const salidas = []
  for (let off = 0; off < 5000; off += 998) {
    const { data: lote, error: errSal } = await supabase
      .from('salidas_cabeceras')
      .select('ruta_id, salida_origen, tipo_dia')
      .in('ruta_id', rutaIds)
      .in('tipo_dia', activos)
      .range(off, off + 997)
    if (errSal) return json({ error: errSal.message }, 400)
    if (!lote || lote.length === 0) break
    salidas.push(...lote)
  }

  if (salidas.length === 0) {
    return json({ error: `Hoy no hay servicio hacia ${destino}.` }, 404)
  }

  // Secuencias: paradas y desfases por ruta
  const secu = []
  for (let off = 0; off < 8000; off += 998) {
    const { data: lote, error: errSec } = await supabase
      .from('secuencia_desfaces')
      .select('ruta_id, parada_id, minutos_desde_origen')
      .in('ruta_id', rutaIds)
      .range(off, off + 997)
    if (errSec) return json({ error: errSec.message }, 400)
    if (!lote || lote.length === 0) break
    secu.push(...lote)
  }

  // Desfase por (ruta, parada)
  const pasosPorRuta = new Map()
  for (const s of secu || []) {
    let lista = pasosPorRuta.get(s.ruta_id)
    if (!lista) {
      lista = []
      pasosPorRuta.set(s.ruta_id, lista)
    }
    lista.push(s)
  }
  const set = new Map(salidas.map((s) => [`${s.ruta_id}|${s.salida_origen}|${s.tipo_dia}`, s]))

  // Paradas donde llegarán autobuses hacia el destino hoy (a partir de ahora)
  const conProximo = new Set()
  for (const s of set.values()) {
    const pasos = pasosPorRuta.get(s.ruta_id) || []
    for (const paso of pasos) {
      const llegada = aMinutos(s.salida_origen) + aMinutos(paso.minutos_desde_origen)
      if (llegada >= ahoraMins) conProximo.add(paso.parada_id)
    }
  }

  if (conProximo.size === 0) {
    return json({ error: `Ya no queda servicio hacia ${destino} hoy.` }, 404)
  }

  // Parada más cercana de entre las que tienen servicio próximo hacia el destino
  let masCercana: any = null
  let menorDistancia = Infinity

  for (const p of paradasInfo.values()) {
    if (!conProximo.has(p.id_parada)) continue
    const d = distanciaKm(lat, lng, Number(p.latitud), Number(p.longitud))
    if (d < menorDistancia) {
      menorDistancia = d
      masCercana = p
    }
  }

  if (!masCercana) return json({ error: `No hay parada con servicio próximo hacia ${destino}.` }, 404)
  return json({ parada: masCercana, distancia_km: Number(menorDistancia.toFixed(2)) })
});

function distanciaKm(lat1, lng1, lat2, lng2) {
  const a = Math.PI / 180
  const dLat = (lat2 - lat1) * a
  const dLng = (lng2 - lng1) * a
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * a) * Math.cos(lat2 * a) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}