import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, priceIdAddonPagos } from "@/lib/stripe";

// Activa el addon Pagos ($24.99/mes) añadiendo un SEGUNDO subscription item
// a la suscripción Pro que el usuario ya tiene en Stripe — mismo patrón
// exacto que /api/stripe/addon-tecnicos/activar. No crea una suscripción
// nueva ni manda a un checkout aparte, se activa al instante con un solo
// click; Stripe prorratea el cargo automáticamente. Requiere que el usuario
// ya sea Pro/Pro+ con una suscripción activa — el módulo Pagos en sí mismo
// ya está gateado a esPro (app/dashboard/pagos/page.tsx).
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await supabase
    .from("users")
    .select("plan, plan_status, stripe_subscription_id, addon_pagos_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || (perfil.plan !== "pro" && perfil.plan !== "proplus")) {
    return NextResponse.json({ error: "El addon Pagos requiere el plan Pro." }, { status: 400 });
  }
  if (perfil.plan_status !== "active" || !perfil.stripe_subscription_id) {
    return NextResponse.json({ error: "Necesitas una suscripción de pago activa para activar addons." }, { status: 400 });
  }
  if (perfil.addon_pagos_status === "activo") {
    return NextResponse.json({ ok: true, yaActivo: true });
  }

  const priceId = priceIdAddonPagos();
  if (!priceId) {
    return NextResponse.json(
      { error: "Falta configurar el Price ID del addon Pagos en las variables de entorno." },
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
      .update({ addon_pagos_status: "activo", addon_pagos_item_id: item.id })
      .eq("id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo activar el addon en Stripe." },
      { status: 500 }
    );
  }
}
