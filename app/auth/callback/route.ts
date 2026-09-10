import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
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
