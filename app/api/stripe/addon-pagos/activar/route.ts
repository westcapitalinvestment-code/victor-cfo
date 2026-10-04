import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, priceIdAddonPagos } from "@/lib/stripe";
import { iniciarCheckoutAddonCliente } from "@/lib/addon-checkout-cliente";

// Activa el addon Pagos ($24.99/mes) añadiendo un SEGUNDO subscription item
// a la suscripción Pro que el usuario ya tiene en Stripe — mismo patrón
// exacto que /api/stripe/addon-tecnicos/activar. No crea una suscripción
// nueva ni manda a un checkout aparte, se activa al instante con un solo
// click; Stripe prorratea el cargo automáticamente. Requiere que el usuario
// ya sea Pro/Pro+ con plan activo — el módulo Pagos en sí mismo ya está
// gateado a esPro (app/dashboard/pagos/page.tsx).
//
// Excepción (4 oct 2026, pedido de Joel): un cliente de Firma Accountant
// (migración 0139) es Pro+/activo pero nunca tiene stripe_subscription_id
// propio — su plan base lo paga la firma. En ese caso, en vez de
// bloquearlo, se le manda a un Checkout de Stripe para que ponga su
// tarjeta solo para este addon — ver lib/addon-checkout-cliente.ts.
//
// Corrección (4 oct 2026, aclarado por Joel: "el plan Business ya viene
// con secretaria/adm, tecnicos incluidos"): el plan Business (proplus) YA
// incluye Pagos — no se cobra aparte. En la práctica esta ruta ya no
// debería llamarse para proplus (el gate de app/dashboard/pagos/page.tsx
// trata el addon como activo sin pasar por aquí), pero se deja esta
// respuesta defensiva por si se llama directo.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await supabase
    .from("users")
    .select("plan, plan_status, stripe_customer_id, stripe_subscription_id, addon_pagos_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || (perfil.plan !== "pro" && perfil.plan !== "proplus")) {
    return NextResponse.json({ error: "El addon Pagos requiere el plan Pro." }, { status: 400 });
  }
  if (perfil.plan_status !== "active") {
    return NextResponse.json({ error: "Necesitas un plan activo para activar addons." }, { status: 400 });
  }
  if (perfil.plan === "proplus") {
    return NextResponse.json({ ok: true, incluido: true });
  }
  if (!perfil.stripe_subscription_id) {
    const priceId = priceIdAddonPagos();
    if (!priceId) {
      return NextResponse.json(
        { error: "Falta configurar el Price ID del addon Pagos en las variables de entorno." },
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
        returnTo: "/dashboard/pagos",
      });
      return NextResponse.json({ ok: true, requierePago: true, checkoutUrl });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No se pudo iniciar el pago con Stripe." },
        { status: 500 }
      );
    }
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
