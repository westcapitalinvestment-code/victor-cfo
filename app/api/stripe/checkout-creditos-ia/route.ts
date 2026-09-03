import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe, priceIdCreditosIA, CREDITO_IA_CENTAVOS_POR_COMPRA } from "@/lib/stripe";
import { claveCicloUso } from "@/lib/ciclo-uso";

// Checkout de créditos de IA — 3 sept 2026, migración 0064. A diferencia de
// /api/stripe/checkout (planes, suscripción), esto es un pago ÚNICO (mode:
// "payment") — se compra, se gasta, se compra otra vez cuando se acabe.
// El crédito aplica al ciclo de facturación ACTUAL del usuario (mismo
// cálculo que el tope de gasto de IA, ver lib/ciclo-uso.ts) — se manda por
// metadata para que el webhook no tenga que recalcularlo con datos que
// podrían haber cambiado entre el checkout y la confirmación del pago.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const priceId = priceIdCreditosIA();
  if (!priceId) {
    return NextResponse.json(
      { error: "Falta configurar el Price ID de créditos de IA en las variables de entorno." },
      { status: 500 }
    );
  }

  const { data: perfil } = await supabase
    .from("users")
    .select("stripe_customer_id, ciclo_inicio, ciclo_fin")
    .eq("id", user.id)
    .maybeSingle();

  const cicloClave = claveCicloUso(perfil);
  const origin = req.headers.get("origin") || "https://www.victorcfo.com";

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer: perfil?.stripe_customer_id || undefined,
      customer_email: perfil?.stripe_customer_id ? undefined : user.email,
      metadata: {
        tipo: "creditos_ia",
        supabase_user_id: user.id,
        ciclo_clave: cicloClave,
        credito_centavos: String(CREDITO_IA_CENTAVOS_POR_COMPRA),
      },
      success_url: `${origin}/dashboard/config?creditos=comprados`,
      cancel_url: `${origin}/dashboard/config`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo iniciar el pago con Stripe." },
      { status: 500 }
    );
  }
}
