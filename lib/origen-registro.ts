import { createAdminClient } from "@/lib/supabase/admin";

// Copia la cookie vc_origen (ver app/origen-tracker.tsx) a users.origen al
// crear la cuenta (18 nov 2026). Se llama desde dos lugares, igual que la
// bienvenida: la ruta pública /api/registro/bienvenida-inicial (registro con
// email) y app/auth/callback/route.ts (registro con Google). Seguro de
// llamar más de una vez: solo escribe si la cuenta es nueva (< 2 horas) y
// todavía no tiene origen guardado. Best-effort: nunca lanza.
const CLAVES = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "coop", "landing", "referrer", "capturado_en"];

export function leerCookieOrigen(valor: string | undefined | null): Record<string, string> | null {
  if (!valor) return null;
  try {
    const crudo = JSON.parse(decodeURIComponent(valor));
    if (!crudo || typeof crudo !== "object") return null;
    const limpio: Record<string, string> = {};
    for (const k of CLAVES) {
      const v = (crudo as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) limpio[k] = v.trim().slice(0, 100);
    }
    return Object.keys(limpio).length ? limpio : null;
  } catch {
    return null;
  }
}

export async function guardarOrigenRegistro(userId: string, cookieValor: string | undefined | null): Promise<void> {
  try {
    const origen = leerCookieOrigen(cookieValor);
    if (!origen) return;

    const admin = createAdminClient();
    const { data: usuario } = await admin.from("users").select("origen, created_at").eq("id", userId).maybeSingle();
    if (!usuario || usuario.origen) return;

    const creadaHaceMs = usuario.created_at ? Date.now() - new Date(usuario.created_at).getTime() : Infinity;
    if (creadaHaceMs > 2 * 60 * 60 * 1000) return;

    const coop = origen.coop ? origen.coop.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 50) : null;
    await admin
      .from("users")
      .update({ origen, ...(coop ? { origen_cooperativa: coop } : {}) })
      .eq("id", userId)
      .is("origen", null);
  } catch {
    // Best-effort: nunca debe bloquear el registro.
  }
}
