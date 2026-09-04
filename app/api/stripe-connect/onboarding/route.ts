import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Onboarding de Stripe Connect Standard (migración 0065, 3 sept 2026) — el
// botón "Activar cobro con tarjeta" en la entidad llama esta ruta, que:
//   1. Si la entidad no tiene stripe_connect_account_id todavía, crea una
//      cuenta Standard nueva en Stripe.
//   2. Genera un Account Link (el link temporal que manda al usuario Pro a
//      la pantalla de Stripe — "Selecciona la cuenta..." o "Crear cuenta
//      nueva", exactamente como en FreshBooks) y lo devuelve.
// Standard, NO Express/Custom (decisión de Joel, 3 sept 2026): la cuenta es
// 100% del usuario Pro — su propio dashboard de Stripe, sus depósitos, su
// soporte directo con Stripe. VICTOR nunca es dueño ni intermediario del
// dinero, y no le cobra comisión de plataforma encima (ver checkout/route.ts).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { entityId } = await req.json().catch(() => ({ entityId: null }));
  if (!entityId) {
    return NextResponse.json({ error: "Falta el ID de la entidad." }, { status: 400 });
  }

  // Restringido al dueño real de la entidad (no admin/secretaria) — es una
  // configuración financiera sensible, igual de criterio que el certificado
  // de relevo (app/api/entidades/[id]/relevo/route.ts).
  const { data: entidad, error: errorEntidad } = await supabase
    .from("business_entities")
    .select("id, name, email, stripe_connect_account_id")
    .eq("id", entityId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (errorEntidad || !entidad) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }

  const origin = req.headers.get("origin") || "https://www.victorcfo.com";
  const returnUrl = `${origin}/dashboard/entidades/${entidad.id}/editar?stripe_connect=regreso`;
  const refreshUrl = `${origin}/dashboard/entidades/${entidad.id}/editar?stripe_connect=refresh`;

  try {
    let accountId = entidad.stripe_connect_account_id;

    if (!accountId) {
      const account = await getStripe().accounts.create({
        type: "standard",
        country: "US", // Stripe trata a Puerto Rico como US — la dirección real del negocio se llena dentro del onboarding.
        email: entidad.email || user.email || undefined,
        business_profile: entidad.name ? { name: entidad.name } : undefined,
      });
      accountId = account.id;

      await supabase.from("business_entities").update({ stripe_connect_account_id: accountId }).eq("id", entidad.id);
    }

    const accountLink = await getStripe().accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo iniciar la conexión con Stripe." },
      { status: 500 }
    );
  }
}
