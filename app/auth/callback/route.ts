import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarBienvenidaInicial } from "@/lib/bienvenida-inicial";
import { enviarEventoCAPI } from "@/lib/meta-capi";

// Callback de OAuth (Google/Apple) — Supabase redirige aquí con ?code=...
// después de que el usuario autoriza en el proveedor (10 sept 2026, pedido
// de Joel). exchangeCodeForSession() intercambia ese code por una sesión
// real (cookies) — el trigger handle_new_user (migraciones 0002/0031/0070)
// ya creó la fila en public.users con los defaults (plan_status
// 'incomplete') apenas Supabase creó el auth.users, sin que este código
// tenga que hacer nada para eso.
//
// signInWithOAuth() (ver /registro y /login) manda el plan/ciclo/ref/socio/
// gratis elegidos como query params en el redirectTo — a diferencia de
// signUp(), no existe un options.data equivalente para OAuth (los metadatos
// los define el proveedor, no nosotros). Por eso ese "estado" viaja en la
// URL y se aplica aquí, una sola vez, vía aplicar_datos_registro_oauth
// (migración 0083), que valida todo server-side igual que el trigger.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/onboarding";
  const plan = searchParams.get("plan");
  const ciclo = searchParams.get("ciclo") || "mensual";
  const ref = searchParams.get("ref");
  const socio = searchParams.get("socio");
  const gratis = searchParams.get("gratis") === "true";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabase = createClient();
  const { data: sesionData, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  // Bienvenida al registro, pague o no (21 sept 2026) — mismo mecanismo que
  // app/registro/page.tsx, pero aquí ya hay sesión así que se llama directo
  // (sin pasar por la ruta pública). Idempotente: en un login normal de un
  // usuario que ya la recibió, esto no hace nada. Fire-and-forget.
  if (sesionData.user?.id) {
    enviarBienvenidaInicial(sesionData.user.id).catch(() => {});

    // Meta CAPI: evento Lead para registros nuevos por Google (26 sept 2026,
    // hallazgo de Joel al revisar por qué la campaña no se movía) —
    // fbqTrack("Lead") solo vivía en app/registro/page.tsx, el camino de
    // email/contraseña. El camino de Google (ahora el botón principal desde
    // el 25 sept) nunca avisaba nada, porque el navegador se va directo a
    // Google antes de que corra ese JS del cliente — Meta quedaba ciego a
    // las conversiones reales que SÍ estaban pasando por el botón
    // principal, y sin esa señal el algoritmo no tenía con qué aprender.
    // Se manda server-side aquí, una vez que ya hay sesión confirmada.
    // Solo cuenta como Lead si la cuenta se acaba de crear (< 5 min) — un
    // login normal de un usuario viejo por Google no debe reportarse otra
    // vez como una conversión nueva.
    const creadaHaceMs = sesionData.user.created_at
      ? Date.now() - new Date(sesionData.user.created_at).getTime()
      : Infinity;
    if (creadaHaceMs < 5 * 60 * 1000) {
      enviarEventoCAPI({
        eventName: "Lead",
        email: sesionData.user.email,
        fbp: req.cookies.get("_fbp")?.value,
        fbc: req.cookies.get("_fbc")?.value,
        clientIp:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
        eventSourceUrl: `${origin}/registro`,
        customData: { plan: plan || "gratis", gratis, via: "google" },
      }).catch(() => {});
    }
  }

  // Aplica referido/socio/plan-gratis si venían en la URL — no-op si no hay
  // nada que aplicar, o si la cuenta ya no califica (ver la función).
  if (ref || socio || gratis) {
    await supabase.rpc("aplicar_datos_registro_oauth", {
      p_ref_id: ref,
      p_socio_codigo: socio,
      p_gratis: gratis,
    });
  }

  if (gratis) {
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  // Camino de pago (el primario, ver /registro): si venía un plan elegido,
  // lo mandamos a completar-pago con ese plan/ciclo ya preseleccionado —
  // ahí el botón "Continuar al pago" crea el Checkout Session (con el
  // trial de 7 días, ver checkout/route.ts) a un solo tap más. Si no venía
  // plan (ej. login normal de un usuario ya pagando), sigue a `next`.
  const destino = plan ? `/registro/completar-pago?plan=${plan}&ciclo=${ciclo}` : next;

  return NextResponse.redirect(`${origin}${destino}`);
}
