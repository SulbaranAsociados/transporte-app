import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LOCALIDADES = {
  'la pineda': 'la pineda',
  'salou': 'salou',
  'vila-seca': 'vila-seca',
  'tarragona': 'tarragona',
  'cambrils': 'cambrils',
  'reus': 'reus',
  'barcelona': 'barcelona',
  'cap salou': 'cap salou',
}

function aMinutos(hm) {
  if (!hm) return 0
  const [h, m] = String(hm).split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

function minAFecha(min) {
  const t = Math.round(min)
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

const json = (cuerpo, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )

  let paradaId
  let destino
  let rutaId
  let hora
  try {
    const body = await req.json()
    paradaId = (body.parada_id || '').trim()
    destino = (body.destino || '').trim()
    rutaId = (body.ruta_id || '').trim() || undefined
    hora = (body.hora || '').trim() || undefined
  } catch {
    const url = new URL(req.url)
    paradaId = (url.searchParams.get('parada_id') || '').trim()
    destino = (url.searchParams.get('destino') || '').trim()
    rutaId = url.searchParams.get('ruta_id') || undefined
    hora = url.searchParams.get('hora') || undefined
  }

  if (!paradaId) return json({ error: 'parada_id es requerido.' }, 400)

  const { data: paradas, error: errPar } = await supabase
    .from('paradas')
    .select('id_parada, nombre, localidad')
  if (errPar) return json({ error: errPar.message }, 400)
  const nombrePorId = {}
  const localidadPorId = {}
  for (const p of paradas || []) {
    nombrePorId[p.id_parada] = p.nombre
    localidadPorId[p.id_parada] = (p.localidad || '').toLowerCase()
  }

  // Rutas candidatas: hacia el destino y que pasan por la parada del usuario.
  let rutasQuery = supabase
    .from('rutas')
    .select('id_ruta, nombre, destino')
  if (rutaId) {
    rutasQuery = rutasQuery.eq('id_ruta', rutaId)
  } else if (destino) {
    rutasQuery = rutasQuery.eq('destino', destino)
  }
  const { data: rutas, error: errRut } = await rutasQuery
  if (errRut) return json({ error: errRut.message }, 400)

  const rutasCandidatas = []
  for (const r of rutas || []) {
    const { data: pasos, error: errPas } = await supabase
      .from('secuencia_desfaces')
      .select('parada_id, orden_secuencia, minutos_desde_origen')
      .eq('ruta_id', r.id_ruta)
      .eq('parada_id', paradaId)
    if (errPas) return json({ error: errPas.message }, 400)
    if ((pasos || []).length > 0) rutasCandidatas.push(r)
  }

  if (rutasCandidatas.length === 0) {
    return json({ error: 'La parada no pertenece a una ruta hacia ese destino.' }, 404)
  }

  const ruta = rutasCandidatas[0]

  const { data: secuencia, error: errSec } = await supabase
    .from('secuencia_desfaces')
    .select('parada_id, orden_secuencia, minutos_desde_origen')
    .eq('ruta_id', ruta.id_ruta)
    .order('orden_secuencia', { ascending: true })

  if (errSec) return json({ error: errSec.message }, 400)

  const destinoLoc = destino ? LOCALIDADES[destino.toLowerCase()] : null

  // Posición del usuario: elegir la ocurrencia que va hacia el destino.
  let inicio = null
  let fin = null
  for (let i = 0; i < (secuencia || []).length; i++) {
    if (secuencia[i].parada_id !== paradaId) continue
    let finCand = null
    if (destinoLoc) {
      for (let j = i; j < secuencia.length; j++) {
        if (localidadPorId[secuencia[j].parada_id] === destinoLoc) finCand = j
      }
    }
    if (finCand !== null) {
      inicio = i
      fin = finCand
      break
    }
  }

  // Si el destino no tiene localidad (estación de tren / aeropuerto), el final es la última parada.
  if (inicio === null) {
    if (destino) {
      return json({ error: 'Esta ruta no pasa por el destino en ese sentido.' }, 404)
    }
    for (let i = 0; i < (secuencia || []).length; i++) {
      if (secuencia[i].parada_id === paradaId) {
        inicio = i
        break
      }
    }
    if (inicio === null) {
      return json({ error: 'No se encontró la parada en la ruta.' }, 404)
    }
    fin = secuencia.length - 1
  }

  const desfaseInicio = aMinutos(secuencia[inicio].minutos_desde_origen)
  const baseMins = hora !== undefined ? aMinutos(hora) : null

  const paradasRuta = secuencia.slice(inicio, fin + 1).map((s) => {
    const mins = aMinutos(s.minutos_desde_origen)
    return {
      parada_id: s.parada_id,
      parada: nombrePorId[s.parada_id] || s.parada_id,
      localidad: localidadPorId[s.parada_id],
      hora: baseMins !== null ? minAFecha(baseMins + (mins - desfaseInicio)) : '',
      minutos_desde_origen: mins,
    }
  })

  return json({
    parada_inicio: paradaId,
    destino,
    ruta_id: ruta.id_ruta,
    ruta: ruta.nombre,
    paradas: paradasRuta,
  })
})