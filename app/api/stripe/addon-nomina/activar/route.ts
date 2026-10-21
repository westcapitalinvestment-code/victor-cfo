import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, priceIdAddonNomina, nominaIncluidaEnPlan } from "@/lib/stripe";
import { iniciarCheckoutAddonCliente } from "@/lib/addon-checkout-cliente";

// Activa el addon Nómina ($24.99/mes, migración 0167, 19 oct 2026): añade un
// subscription item a la suscripción que el usuario ya tiene — mismo patrón
// exacto que /api/stripe/addon-pagos/activar. Un cliente de Firma Accountant
// sin suscripción propia va a un Checkout solo para este addon (ver
// lib/addon-checkout-cliente.ts). Business solo lo incluye para los primeros
// 100 clientes ("fundadores", users.nomina_fundador); los demás lo activan aquí.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await supabase
    .from("users")
    .select("plan, plan_status, stripe_customer_id, stripe_subscription_id, addon_nomina_status, nomina_fundador")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || (perfil.plan !== "pro" && perfil.plan !== "proplus")) {
    return NextResponse.json({ error: "El addon Nómina requiere el plan Pro." }, { status: 400 });
  }
  if (perfil.plan_status !== "active") {
    return NextResponse.json({ error: "Necesitas un plan activo para activar addons." }, { status: 400 });
  }
  if (nominaIncluidaEnPlan(perfil)) {
    return NextResponse.json({ ok: true, incluido: true });
  }
  if (!perfil.stripe_subscription_id) {
    const priceId = priceIdAddonNomina();
    if (!priceId) {
      return NextResponse.json(
        { error: "Falta configurar el Price ID del addon Nómina en las variables de entorno." },
        { status: 500 }
      );
    }
    try {
      const checkoutUrl = await iniciarCheckoutAddonCliente({
        userId: user.id,
        userEmail: user.email!,
        stripeCustomerId: perfil.stripe_customer_id ?? null,
        items: [{ priceId, quantity: 1 }],
        origin: req.headers.get("origin") || "https://www.victorcfo.com",
        returnTo: "/dashboard/nomina",
      });
      return NextResponse.json({ ok: true, requierePago: true, checkoutUrl });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No se pudo iniciar el pago con Stripe." },
        { status: 500 }
      );
    }
  }
  if (perfil.addon_nomina_status === "activo") {
    return NextResponse.json({ ok: true, yaActivo: true });
  }

  const priceId = priceIdAddonNomina();
  if (!priceId) {
    return NextResponse.json(
      { error: "Falta configurar el Price ID del addon Nómina en las variables de entorno." },
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
      .update({ addon_nomina_status: "activo", addon_nomina_item_id: item.id })
      .eq("id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo activar el addon en Stripe." },
      { status: 500 }
    );
  }
}
