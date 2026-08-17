import { createBrowserClient } from "@supabase/ssr";

// Cliente para usar en Client Components ('use client').
// Usa SOLO la llave anon — nunca el service_role aquí.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
