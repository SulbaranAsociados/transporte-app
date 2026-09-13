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

function minutosAAFecha(baseMins, minutos) {
  const t = baseMins + minutos
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  let paradaId
  let destino
  try {
    const body = await req.json()
    paradaId = (body.parada_id || '').trim()
    destino = (body.destino || '').trim()
  } catch {
    const url = new URL(req.url)
    paradaId = (url.searchParams.get('parada_id') || '').trim()
    destino = (url.searchParams.get('destino') || '').trim()
  }

  if (!paradaId) {
    return new Response(JSON.stringify({ error: 'parada_id es requerido' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { hoy, diaSemana } = calcularDiaActual()
  const ahoraMins = horaEnMinutosLocal()

  // Nombre de la parada
  const { data: paradaInfo, error: errParada } = await supabase
    .from('paradas')
    .select('id_parada, nombre')
    .eq('id_parada', paradaId)
    .maybeSingle()

  if (errParada) {
    return new Response(JSON.stringify({ error: errParada.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ¿Día festivo?
  const { data: festivos, error: errFestivos } = await supabase
    .from('festivos')
    .select('id')
    .eq('fecha', hoy)
    .eq('activo', true)

  if (errFestivos) {
    return new Response(JSON.stringify({ error: errFestivos.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const esFestivo = (festivos || []).length > 0

  // Número del día (0 lun..6 dom en DB se maneja por banderas)
  const jornada = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][diaSemana]

  // 1. Rutas que pasan por la parada
  const { data: secu, error: errSecu } = await supabase
    .from('secuencia_desfaces')
    .select('ruta_id, parada_id, minutos_desde_origen')
    .eq('parada_id', paradaId)

  if (errSecu) {
    return new Response(JSON.stringify({ error: errSecu.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const desfases = {}
  for (const s of secu || []) {
    if (!desfases[s.ruta_id]) desfases[s.ruta_id] = s.minutos_desde_origen
  }
  const rutaIds = Object.keys(desfases)

  if (rutaIds.length === 0) {
    return new Response(JSON.stringify({ found: false, parada_id: paradaId, parada_nombre: paradaInfo ? paradaInfo.nombre : null, autobuses: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2. Calendarios activos hoy
  const { data: calendarios, error: errCal } = await supabase
    .from('calendario')
    .select('*')

  if (errCal) {
    return new Response(JSON.stringify({ error: errCal.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const activos = getCalendariosActivos(calendarios || [], esFestivo)

  // 3. Salidas de las rutas hacia la parada según calendario
  const { data: salidas, error: errSal } = await supabase
    .from('salidas_cabeceras')
    .select('ruta_id, salida_origen, tipo_dia')
    .in('ruta_id', rutaIds)
    .in('tipo_dia', activos)

  if (errSal) {
    return new Response(JSON.stringify({ error: errSal.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 4. Nombre y destino de las rutas
  let rutasQuery = supabase
    .from('rutas')
    .select('id_ruta, nombre, destino, origen')
    .in('id_ruta', rutaIds)
  if (destino) rutasQuery = rutasQuery.eq('destino', destino)
  const { data: rutas, error: errRutas } = await rutasQuery

  if (errRutas) {
    return new Response(JSON.stringify({ error: errRutas.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const rutasInfo = {}
  const rutasFiltradas = new Set()
  for (const r of rutas || []) {
    rutasInfo[r.id_ruta] = r
    rutasFiltradas.add(r.id_ruta)
  }

  const numeroDe = (nombre) => {
    const m = (nombre || '').match(/Autobus\s+([0-9]+)/i)
    return m ? m[1] : null
  }

  // 5. Conectar salidas con desfases y filtrar las próximas 4
  const vistos = new Set()
  const autobuses = []
  for (const s of salidas || []) {
    if (!rutasFiltradas.has(s.ruta_id)) continue
    const clave = `${s.ruta_id}|${s.salida_origen}|${s.tipo_dia}`
    if (vistos.has(clave)) continue
    vistos.add(clave)

    const desfase = aMinutos(desfases[s.ruta_id])
    const hora = aMinutos(s.salida_origen) + desfase
    if (hora < ahoraMins) continue
    const r = rutasInfo[s.ruta_id]
    autobuses.push({
      hora: minutosAAFecha(aMinutos(s.salida_origen), desfase),
      numero: numeroDe(r ? r.nombre : ''),
      destino: r ? r.destino : null,
      ruta: r ? r.nombre : null,
      ruta_id: s.ruta_id,
      calendario: s.tipo_dia,
    })
  }

  autobuses.sort((a, b) => a.hora.localeCompare(b.hora))

  return new Response(
    JSON.stringify({
      found: autobuses.length > 0,
      parada_id: paradaId,
      parada_nombre: paradaInfo ? paradaInfo.nombre : null,
      dia: jornada,
      festivo: esFestivo,
      autobuses: autobuses.slice(0, 4),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})