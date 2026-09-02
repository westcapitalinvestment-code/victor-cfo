import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, priceIdAddonTecnicos } from "@/lib/stripe";

// Activa el addon Equipo ($20/mes, hasta 3 técnicos) añadiendo un SEGUNDO
// subscription item a la suscripción Pro que el usuario ya tiene en
// Stripe — no crea una suscripción nueva ni manda a un checkout aparte,
// así que se activa al instante con un solo click. Stripe prorratea el
// cargo automáticamente (proration_behavior por default) y lo suma a la
// próxima factura. Requiere que el usuario ya sea Pro/Pro+ con una
// suscripción activa — Equipo en sí mismo ya está gateado a esPro
// (app/dashboard/equipo/page.tsx), así que si llegó hasta aquí ya
// debería tener stripe_subscription_id.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await supabase
    .from("users")
    .select("plan, plan_status, stripe_subscription_id, addon_tecnicos_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || (perfil.plan !== "pro" && perfil.plan !== "proplus")) {
    return NextResponse.json({ error: "El addon Equipo requiere el plan Pro." }, { status: 400 });
  }
  if (perfil.plan_status !== "active" || !perfil.stripe_subscription_id) {
    return NextResponse.json({ error: "Necesitas una suscripción de pago activa para activar addons." }, { status: 400 });
  }
  if (perfil.addon_tecnicos_status === "activo") {
    return NextResponse.json({ ok: true, yaActivo: true });
  }

  const priceId = priceIdAddonTecnicos();
  if (!priceId) {
    return NextResponse.json(
      { error: "Falta configurar el Price ID del addon Técnicos en las variables de entorno." },
      { status: 500 }
    );
  }

  try {
    const item = await getStripe().subscriptionItems.create({
      subscription: perfil.stripe_subscription_id,
      price: priceId,
      quantity: 1,
    });

    await supabase
      .from("users")
      .update({ addon_tecnicos_status: "activo", addon_tecnicos_item_id: item.id })
      .eq("id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo activar el addon en Stripe." },
      { status: 500 }
    );
  }
}
