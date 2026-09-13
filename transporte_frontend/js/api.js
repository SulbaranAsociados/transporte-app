// Configuración de acceso a Supabase Edge Functions.
// La clave publishable es pública por diseño y solo permite invocar las funciones.
const SUPABASE_URL = 'https://vngciwggflrlpzgkylmx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rKjkBjoBdTtZZNGIqoAM-Q_Q41yTMTt';

async function llamarFuncion(nombre, opciones = {}) {
  const { method = 'POST', body = null, query = null } = opciones;

  let url = `${SUPABASE_URL}/functions/v1/${nombre}`;
  if (query) url += '?' + new URLSearchParams(query).toString();

  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  const init = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    let detalle = '';
    try { detalle = JSON.stringify(await res.json()); } catch { detalle = res.statusText; }
    throw new Error(`[${nombre}] ${res.status} ${detalle}`);
  }
  return res.json();
}

const EstacionOrigen = {
  id: 't_010',
  nombre: 'Vila-seca',
};

async function recalcularOrigenMasCercano() {
  const noUbicacion = sessionStorage.getItem('noUbicacion') === 'true';

  let lat;
  let lng;
  if (noUbicacion) {
    lat = sessionStorage.getItem('userLat');
    lng = sessionStorage.getItem('userLng');
  } else if (navigator.geolocation) {
    const coords = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
      );
    });
    if (coords) {
      lat = coords.latitude;
      lng = coords.longitude;
      sessionStorage.setItem('userLat', lat);
      sessionStorage.setItem('userLng', lng);
      sessionStorage.removeItem('noUbicacion');
    } else {
      lat = sessionStorage.getItem('userLat');
      lng = sessionStorage.getItem('userLng');
    }
  } else {
    lat = sessionStorage.getItem('userLat');
    lng = sessionStorage.getItem('userLng');
  }

  if (lat && lng) {
    try {
      const r = await llamarFuncion('estacion-mas-cercana', {
        body: { lat: Number(lat), lng: Number(lng) },
      });
      if (r.estacion) {
        const id = r.estacion.id;
        const nombre = r.estacion.estacion || r.estacion.nombre || id;
        sessionStorage.setItem('origenId', id);
        sessionStorage.setItem('origenNombre', nombre);
        return { id, nombre, origenId: id, origenNombre: nombre };
      }
    } catch (err) {
      console.error(err);
    }
  }

  const id = sessionStorage.getItem('origenId') || EstacionOrigen.id;
  const nombre = sessionStorage.getItem('origenNombre') || EstacionOrigen.nombre;
  sessionStorage.setItem('origenId', id);
  sessionStorage.setItem('origenNombre', nombre);
  return { id, nombre, origenId: id, origenNombre: nombre };
}
