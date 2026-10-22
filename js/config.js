'use strict';
/* Configuración de conexión.
   Con ambos valores vacíos la app funciona en MODO DEMOSTRACIÓN (datos en este navegador, sin login real).
   Para activar login y base de datos reales, copia aquí la URL y la clave pública (anon / publishable)
   de tu proyecto en Supabase → Project Settings → API. La clave pública es segura de exponer;
   la seguridad la dan las políticas RLS de supabase/migrations. NUNCA pegues aquí la service_role key. */

const APP_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: ''
};
