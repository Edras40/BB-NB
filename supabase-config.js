/* =====================================================================
   CONFIGURACIÓN DE SUPABASE (compartida entre index.html y tv.html)
   La "anon public key" está diseñada para usarse en el navegador: solo
   permite lo que las políticas de Row Level Security autoricen (en este
   proyecto: insertar y leer votos, nada más).
   ===================================================================== */
const SUPABASE_URL = 'https://zbipfclopjktiauhqnhq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_uIpFUIryrxvlTVI-6K7drw_FN1lVK6A';

// `supabase` es el objeto global que carga la librería supabase-js por CDN.
// Lo renombramos a `sb` para no chocar con ese nombre.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
