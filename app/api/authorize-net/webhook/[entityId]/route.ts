import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { credencialesDeEntidad, detalleTransaccion, firmaValida } from "@/lib/authorize-net";

// Aviso de Authorize.Net cuando un cliente paga una factura por B2B Merchant
// (18 nov 2026). Una URL por entidad, así sabemos con qué llaves verificar.
// Pasos: firma HMAC-SHA512 con la Signature Key de la entidad → se pide la
// transacción a Authorize.Net (no se confía en el cuerpo del aviso) → se
// casa por order.invoiceNumber (invoices.authnet_ref) y el monto → pagada.
export async function POST(req: NextRequest, { params }: { params: { entityId: string } }) {
  const cuerpo = await req.text();
  const c = await credencialesDeEntidad(params.entityId);
  if (!c || !c.signatureKey) return NextResponse.json({ ok: true }); // entidad sin B2B: se ignora

  if (!firmaValida(cuerpo, req.headers.get("x-anet-signature"), c.signatureKey)) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }

  let evento: any;
  try {
    evento = JSON.parse(cuerpo);
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (evento?.eventType !== "net.authorize.payment.authcapture.created") return NextResponse.json({ ok: true });

  const transId = String(evento?.payload?.id ?? "");
  if (!transId) return NextResponse.json({ ok: true });

  const tx = await detalleTransaccion(c, transId);
  if (!tx) return NextResponse.json({ error: "No se pudo confirmar la transacción." }, { status: 500 });

  // Solo transacciones aprobadas (responseCode 1).
  if (Number(tx.responseCode) !== 1) return NextResponse.json({ ok: true });

  const ref = tx?.order?.invoiceNumber as string | undefined;
  if (!ref) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const { data: factura } = await admin
    .from("invoices")
    .select("id, total, estado")
    .eq("entity_id", params.entityId)
    .eq("authnet_ref", ref)
    .maybeSingle();
  if (!factura || factura.estado === "pagada") return NextResponse.json({ ok: true });

  const cobrado = Number(tx.authAmount ?? tx.settleAmount ?? 0);
  if (Math.abs(cobrado - Number(factura.total ?? 0)) > 0.009) {
    console.error(`B2B: monto ${cobrado} no coincide con la factura ${factura.id} (${factura.total}).`);
    return NextResponse.json({ ok: true });
  }

  await admin
    .from("invoices")
    .update({
      estado: "pagada",
      metodo_pago: "Tarjeta",
      fecha_pago: new Date().toISOString().slice(0, 10),
      authnet_transaction_id: transId,
    })
    .eq("id", factura.id)
    .neq("estado", "pagada");

  return NextResponse.json({ ok: true });
}
