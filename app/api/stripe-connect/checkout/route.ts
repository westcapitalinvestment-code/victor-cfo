import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

// Genera el link de cobro REAL de una factura (migración 0065, 3 sept
// 2026) — el botón "Cobrar con tarjeta" en factura-detalle llama esta ruta.
// A diferencia de "Registrar pago" (que solo anota a mano un cobro que ya
// pasó por fuera), esto crea un Checkout Session de Stripe A NOMBRE DE LA
// CUENTA CONECTADA del usuario Pro (header stripeAccount) — el dinero le
// cae directo a SU balance de Stripe, VICTOR nunca lo toca ni se queda con
// nada (decisión de Joel: sin comisión de plataforma).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { invoiceId } = await req.json().catch(() => ({ invoiceId: null }));
  if (!invoiceId) {
    return NextResponse.json({ error: "Falta el ID de la factura." }, { status: 400 });
  }

  const { data: factura, error: errorFactura } = await supabase
    .from("invoices")
    .select("id, owner_id, numero, total, estado, entity_id, business_entities(name, stripe_connect_account_id, stripe_connect_charges_enabled)")
    .eq("id", invoiceId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (errorFactura || !factura) {
    return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  }

  if (factura.estado === "pagada") {
    return NextResponse.json({ error: "Esta factura ya está marcada como pagada." }, { status: 400 });
  }

  const entidad = (factura as any).business_entities as {
    name: string;
    stripe_connect_account_id: string | null;
    stripe_connect_charges_enabled: boolean;
  } | null;

  if (!entidad?.stripe_connect_account_id || !entidad.stripe_connect_charges_enabled) {
    return NextResponse.json(
      { error: "Todavía no has activado el cobro con tarjeta para este negocio (Configuración de la entidad)." },
      { status: 400 }
    );
  }

  const total = Number((factura as any).total ?? 0);
  if (!(total > 0)) {
    return NextResponse.json({ error: "La factura no tiene un total válido para cobrar." }, { status: 400 });
  }

  const origin = req.headers.get("origin") || "https://www.victorcfo.com";

  try {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(total * 100),
              product_data: {
                name: `Factura #${(factura as any).numero ?? factura.id.slice(0, 8)}`,
                description: entidad.name || undefined,
              },
            },
            quantity: 1,
          },
        ],
        metadata: { invoice_id: factura.id },
        success_url: `${origin}/dashboard/facturacion/${factura.id}?cobro=exitoso`,
        cancel_url: `${origin}/dashboard/facturacion/${factura.id}`,
      },
      { stripeAccount: entidad.stripe_connect_account_id }
    );

    // Guardamos el Checkout Session ID en la misma columna que ya existía
    // (stripe_payment_intent, de la migración 0001) — así el webhook y la
    // pantalla pueden rastrear qué sesión de Stripe corresponde a esta
    // factura sin necesitar una columna nueva.
    await supabase.from("invoices").update({ stripe_payment_intent: session.id }).eq("id", factura.id);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo generar el link de cobro." },
      { status: 500 }
    );
  }
}
