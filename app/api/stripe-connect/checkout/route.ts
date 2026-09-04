import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolverLinkCobro } from "@/lib/stripe-connect-checkout";

// Genera el link de cobro REAL de una factura (migración 0065, 3 sept
// 2026) — el botón "Cobrar con tarjeta" en factura-detalle llama esta ruta.
// A diferencia de "Registrar pago" (que solo anota a mano un cobro que ya
// pasó por fuera), esto crea un Checkout Session de Stripe A NOMBRE DE LA
// CUENTA CONECTADA del usuario Pro (header stripeAccount) — el dinero le
// cae directo a SU balance de Stripe, VICTOR nunca lo toca ni se queda con
// nada (decisión de Joel: sin comisión de plataforma).
//
// La verificación de dueño vive AQUÍ (con el cliente de sesión, respeta
// RLS) — lib/stripe-connect-checkout.ts hace el resto con el cliente admin,
// compartido con la ruta pública /api/facturas/[id]/pagar (link estable del
// PDF/correo).
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
    .select("id")
    .eq("id", invoiceId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (errorFactura || !factura) {
    return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  }

  const resultado = await resolverLinkCobro(invoiceId);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  }
  return NextResponse.json({ url: resultado.url });
}
