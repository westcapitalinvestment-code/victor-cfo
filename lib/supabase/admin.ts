import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente de servicio — SOLO para trabajos de servidor que no tienen una
// sesión de usuario (como el cron nocturno de Plaid en app/api/cron/*).
// Usa la service_role key de Supabase, que se salta RLS por completo —
// por eso nunca se expone al navegador ni se usa en ninguna ruta que no
// esté protegida por su propio secreto (ver CRON_SECRET).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para crear el cliente admin de Supabase."
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
