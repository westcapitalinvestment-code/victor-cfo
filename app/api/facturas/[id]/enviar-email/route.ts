import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendInvoiceEmail } from "@/lib/email";

// Envío manual del correo de una factura ya existente (21 sept 2026, pedido
// de Joel: "obvio ese boton debe existir") — hasta ahora SOLO las facturas
// recurrentes generadas por el cron (app/api/cron/facturas-recurrentes)
// mandaban email real; las facturas normales creadas a mano solo tenían el
// botón de WhatsApp. Este endpoint reusa exactamente la misma función de
// lib/email.ts que usa el cron, así que el remitente/formato/link de cobro
// salen idénticos.
//
// La autorización vive en RLS (igual que el resto de escrituras de esta
// pantalla, ver factura-detalle.tsx actualizarEstado) — no se filtra por
// owner_id a mano porque un admin/secretaria invitado tiene su propio
// user.id, distinto al del dueño (ver lib/owner-efectivo.ts). Si Postgres no
// le devuelve la fila a este usuario, el 404 de abajo lo cubre solo.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { data: factura, error: fetchError } = await supabase
    .from("invoices")
    .select(
      "id, numero, estado, fecha_vencimiento, clients(name, email), business_entities(name, email, stripe_connect_charges_enabled)"
    )
    .eq("id", params.id)
    .single();

  if (fetchError || !factura) {
    return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  }

  const cliente = Array.isArray(factura.clients) ? factura.clients[0] : factura.clients;
  const entidad = Array.isArray(factura.business_entities) ? factura.business_entities[0] : factura.business_entities;

  if (!cliente?.email) {
    return NextResponse.json({ error: "Este cliente no tiene correo guardado — agrégaselo en Clientes primero." }, { status: 400 });
  }

  const resultado = await sendInvoiceEmail({
    clientEmail: cliente.email,
    clientName: cliente.name ?? null,
    entityName: entidad?.name ?? null,
    invoiceId: factura.id as string,
    invoiceNumber: factura.numero as string,
    dueDate: (factura.fecha_vencimiento as string | null) ?? null,
    cobroTarjetaDisponible: !!entidad?.stripe_connect_charges_enabled,
    replyToEmail: entidad?.email ?? null,
  });

  if (!resultado.sent) {
    return NextResponse.json({ error: resultado.reason ?? "No se pudo enviar el correo." }, { status: 500 });
  }

  if (factura.estado === "borrador") {
    await supabase.from("invoices").update({ estado: "enviada" }).eq("id", factura.id);
  }

  return NextResponse.json({ ok: true });
}
