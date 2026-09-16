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

  // 1. Rutas que pasan por la parada, con su posición (orden) y desfase en cada ruta
  const { data: secu, error: errSecu } = await supabase
    .from('secuencia_desfaces')
    .select('ruta_id, parada_id, minutos_desde_origen, orden_secuencia')
    .eq('parada_id', paradaId)

  if (errSecu) {
    return new Response(JSON.stringify({ error: errSecu.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const pasadas = {}
  for (const s of secu || []) {
    if (!pasadas[s.ruta_id]) pasadas[s.ruta_id] = []
    pasadas[s.ruta_id].push(s)
  }
  const rutaIds = Object.keys(pasadas)

  if (rutaIds.length === 0) {
    return new Response(JSON.stringify({ found: false, parada_id: paradaId, parada_nombre: paradaInfo ? paradaInfo.nombre : null, autobuses: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2. Paradas y localidades (para resolver el destino)
  const { data: paradas, error: errPar } = await supabase
    .from('paradas')
    .select('id_parada, localidad')
  if (errPar) {
    return new Response(JSON.stringify({ error: errPar.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const localidadPorId = {}
  for (const p of paradas || []) localidadPorId[p.id_parada] = (p.localidad || '').toLowerCase()
  const LOCALIDADES = { 'la pineda': 'la pineda', 'salou': 'salou', 'vila-seca': 'vila-seca', 'tarragona': 'tarragona', 'cambrils': 'cambrils', 'reus': 'reus', 'barcelona': 'barcelona', 'cap salou': 'cap salou' }

  // Paradas objetivo del destino
  let destParadas = new Set()
  if (destino) {
    const destLoc = LOCALIDADES[destino.toLowerCase()] || null
    if (destLoc) {
      for (const p of paradas || []) {
        if (destLoc === localidadPorId[p.id_parada]) destParadas.add(p.id_parada)
      }
    } else {
      // Destino especial (Est. del Camp, Aero. Reus...): última parada de las rutas que terminan allí
      const { data: rutasTerm, error: errRT } = await supabase
        .from('rutas')
        .select('id_ruta')
        .eq('destino', destino)
        .limit(50)
      if (errRT) {
        return new Response(JSON.stringify({ error: errRT.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      for (const rid of (rutasTerm || []).map((r) => r.id_ruta)) {
        const { data: ultimo, error: errU } = await supabase
          .from('secuencia_desfaces')
          .select('parada_id')
          .eq('ruta_id', rid)
          .order('orden_secuencia', { ascending: false })
          .limit(1)
        if (!errU && ultimo && ultimo[0]) destParadas.add(ultimo[0].parada_id)
      }
    }
  }

  // 3. Secuencia completa de las rutas (para saber si la parada va "hacia" el destino)
  const { data: secuenciaAll, error: errSecAll } = await supabase
    .from('secuencia_desfaces')
    .select('ruta_id, parada_id, orden_secuencia')
    .in('ruta_id', rutaIds)
  if (errSecAll) {
    return new Response(JSON.stringify({ error: errSecAll.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const secuenciaPorRuta = {}
  for (const s of secuenciaAll || []) {
    if (!secuenciaPorRuta[s.ruta_id]) secuenciaPorRuta[s.ruta_id] = []
    secuenciaPorRuta[s.ruta_id].push(s)
  }

  // 4. Desfase y filtrado: la parada del usuario debe quedar ANTES del tramo del destino.
  const desfases = {}
  const rutasFiltradas = new Set()
  for (const rid of rutaIds) {
    const ocurrencias = (pasadas[rid] || []).sort((a, b) => a.orden_secuencia - b.orden_secuencia)
    if (!destino) {
      desfases[rid] = ocurrencias[0].minutos_desde_origen
      rutasFiltradas.add(rid)
      continue
    }
    if (destParadas.size === 0) continue
    const seq = (secuenciaPorRuta[rid] || []).sort((a, b) => a.orden_secuencia - b.orden_secuencia)
    // Última posición de una parada del destino en la ruta
    let maxDest = -1
    for (let i = 0; i < seq.length; i++) {
      if (destParadas.has(seq[i].parada_id)) maxDest = i
    }
    if (maxDest < 0) continue
    // Primera pasada por la parada del usuario que esté antes del destino
    let mejor = null
    for (const o of ocurrencias) {
      const idx = seq.findIndex((s) => s.parada_id === o.parada_id && s.orden_secuencia === o.orden_secuencia)
      if (idx < maxDest) {
        mejor = o
        break
      }
    }
    if (mejor) {
      desfases[rid] = mejor.minutos_desde_origen
      rutasFiltradas.add(rid)
    }
  }

  if (rutasFiltradas.size === 0) {
    return new Response(JSON.stringify({ found: false, parada_id: paradaId, parada_nombre: paradaInfo ? paradaInfo.nombre : null, autobuses: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 5. Calendarios activos hoy
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

  // 6. Salidas de las rutas hacia la parada según calendario
  const { data: salidas, error: errSal } = await supabase
    .from('salidas_cabeceras')
    .select('ruta_id, salida_origen, tipo_dia')
    .in('ruta_id', [...rutasFiltradas])
    .in('tipo_dia', activos)

  if (errSal) {
    return new Response(JSON.stringify({ error: errSal.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 7. Nombre y destino de las rutas
  const { data: rutas, error: errRutas } = await supabase
    .from('rutas')
    .select('id_ruta, nombre, destino, origen')
    .in('id_ruta', [...rutasFiltradas])

  if (errRutas) {
    return new Response(JSON.stringify({ error: errRutas.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const rutasInfo = {}
  for (const r of rutas || []) rutasInfo[r.id_ruta] = r

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