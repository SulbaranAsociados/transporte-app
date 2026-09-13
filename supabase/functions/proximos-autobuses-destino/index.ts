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
      if (festivo && ANUALES.includes(c.id)) return c.id === 'anual_dom_fest'
      const coincideDia = c[banderas[diaSemana]] === true
      if (!coincideDia) return false
      if (ANUALES.includes(c.id)) return true
      return c.fecha_inicio <= hoy && c.fecha_fin >= hoy
    })
    .map((c) => c.id)
}

function aMinutos(hm) {
  if (!hm) return 0
  const [h, m] = (hm || '').split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

function minAFecha(min) {
  return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

const numeroDe = (nombre) => {
  const m = (nombre || '').match(/Autobus\s+([0-9]+)/i)
  return m ? m[1] : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  let destino
  try {
    const body = await req.json()
    destino = (body.destino || '').trim()
  } catch {
    const url = new URL(req.url)
    destino = (url.searchParams.get('destino') || '').trim()
  }

  if (!destino) {
    return new Response(JSON.stringify({ error: 'destino es requerido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { hoy } = calcularDiaActual()
  const ahoraMins = horaEnMinutosLocal()

  const { data: festivos, error: errFestivos } = await supabase
    .from('festivos')
    .select('id')
    .eq('fecha', hoy)
    .eq('activo', true)
  if (errFestivos) {
    return new Response(JSON.stringify({ error: errFestivos.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const esFestivo = (festivos || []).length > 0

  const { data: calendarios, error: errCal } = await supabase
    .from('calendario')
    .select('*')
  if (errCal) {
    return new Response(JSON.stringify({ error: errCal.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const activos = getCalendariosActivos(calendarios || [], esFestivo)

  // 1. Rutas hacia el destino
  const { data: rutas, error: errRutas } = await supabase
    .from('rutas')
    .select('id_ruta, nombre')
    .eq('destino', destino)
    .limit(50)
  if (errRutas) {
    return new Response(JSON.stringify({ error: errRutas.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const rutaIds = (rutas || []).map((r) => r.id_ruta)

  if (rutaIds.length === 0) {
    return new Response(JSON.stringify({ found: false, destino, vilaSecca: null, laPineda: null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2. Paradas con localidad
  const { data: paradas, error: errPar } = await supabase
    .from('paradas')
    .select('id_parada, nombre, localidad')
  if (errPar) {
    return new Response(JSON.stringify({ error: errPar.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const paradasInfo = {}
  for (const p of paradas || []) paradasInfo[p.id_parada] = p
  const esDe = (pid, localidad) => {
    const loc = ((paradasInfo[pid] || {}).localidad || '').toLowerCase()
    return loc === localidad
  }

  // 3. Secuencias: por ruta, la 1ª parada en "vila-seca" y la 1ª en "la pineda"
  const secu = []
  for (let off = 0; off < 5000; off += 998) {
    const { data: lote, error: errSec } = await supabase
      .from('secuencia_desfaces')
      .select('ruta_id, parada_id, minutos_desde_origen, orden_secuencia')
      .in('ruta_id', rutaIds)
      .range(off, off + 997)
    if (errSec) {
      return new Response(JSON.stringify({ error: errSec.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!lote || lote.length === 0) break
    secu.push(...lote)
  }

  const primeraPorRuta = {}
  for (const s of secu || []) {
    if (!primeraPorRuta[s.ruta_id]) primeraPorRuta[s.ruta_id] = { vilaSecca: null, laPineda: null, visto: {} }
    const pu = primeraPorRuta[s.ruta_id]
    const clave = s.parada_id
    if (pu.visto[clave]) continue
    pu.visto[clave] = true
    const mins = aMinutos(s.minutos_desde_origen)
    if (esDe(s.parada_id, 'vila-seca')) {
      if (!pu.vilaSecca || mins < pu.vilaSecca.min) pu.vilaSecca = { parada_id: s.parada_id, min: mins }
    }
    if (esDe(s.parada_id, 'la pineda')) {
      if (!pu.laPineda || mins < pu.laPineda.min) pu.laPineda = { parada_id: s.parada_id, min: mins }
    }
  }

  // 4. Salidas de hoy según calendario
  const salidas = []
  for (let off = 0; off < 5000; off += 998) {
    const { data: lote, error: errSal } = await supabase
      .from('salidas_cabeceras')
      .select('ruta_id, salida_origen, tipo_dia')
      .in('ruta_id', rutaIds)
      .in('tipo_dia', activos)
      .range(off, off + 997)
    if (errSal) {
      return new Response(JSON.stringify({ error: errSal.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!lote || lote.length === 0) break
    salidas.push(...lote)
  }

  const rutasInfo = {}
  for (const r of rutas || []) rutasInfo[r.id_ruta] = r

  const result = { vilaSecca: null, laPineda: null }
  for (const key of ['vilaSecca', 'laPineda']) {
    for (const s of salidas || []) {
      const pu = primeraPorRuta[s.ruta_id]
      const objetivo = pu ? pu[key] : null
      if (!objetivo) continue
      const llegada = aMinutos(s.salida_origen) + objetivo.min
      if (llegada < ahoraMins) continue
      if (!result[key] || llegada < result[key].min) {
        const r = rutasInfo[s.ruta_id]
        result[key] = {
          hora: minAFecha(llegada),
          min: llegada,
          destino,
          parada_id: objetivo.parada_id,
          parada_nombre: (paradasInfo[objetivo.parada_id] || {}).nombre || objetivo.parada_id,
          numero: numeroDe(r ? r.nombre : ''),
          ruta: r ? r.nombre : null,
          calendario: s.tipo_dia,
        }
      }
    }
    if (result[key]) delete result[key].min
  }

  return new Response(
    JSON.stringify({
      found: !!(result.vilaSecca || result.laPineda),
      destino,
      festivo: esFestivo,
      vilaSecca: result.vilaSecca,
      laPineda: result.laPineda,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})