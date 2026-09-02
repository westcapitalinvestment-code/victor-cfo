import { NextRequest, NextResponse } from "next/server";
import { obtenerContextoTecnico } from "@/lib/tecnico-contexto";

// El técnico convierte una cotización APROBADA que el dueño le asignó en
// una factura real — cuando llega al trabajo y lo termina (Equipo v2, 2
// sept 2026, pedido de Joel: "probablemente sea una cotización que le
// dieron visto bueno para hacerla o una factura"). Copia los ítems tal
// cual (mismo patrón que la conversión que ya hace el dueño en
// cotizacion-detalle.tsx) — sin retención, igual que el resto de facturas
// que arma un técnico en campo (servicio directo al cliente, no B2B).
// Después de convertida, el técnico cae en la misma pantalla de factura
// (PATCH /api/tecnico/facturas/[id]) para añadir evidencia/ítems y
// finalizar — reusa TODO ese flujo, esto solo crea el punto de partida.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada — vuelve a entrar." }, { status: 401 });

  const { data: cotizacion } = await ctx.admin
    .from("cotizaciones")
    .select("id, numero, client_id, subtotal, ivu_pct, ivu_monto, total, deposito_monto, notas")
    .eq("id", params.id)
    .eq("entity_id", ctx.tecnico.entity_id)
    .eq("technician_id", ctx.tecnico.id)
    .eq("estado", "aprobada")
    .maybeSingle();

  if (!cotizacion) {
    return NextResponse.json({ error: "Cotización no encontrada, no está aprobada, o ya se convirtió." }, { status: 404 });
  }

  const { data: items } = await ctx.admin
    .from("cotizacion_items")
    .select("descripcion, detalle, cantidad, precio_unitario, subtotal_linea, service_id")
    .eq("cotizacion_id", cotizacion.id);

  const { count } = await ctx.admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", ctx.tecnico.entity_id);
  const numero = `${ctx.entidad.invoice_prefix}-${ctx.entidad.invoice_start_number + (count ?? 0)}`;

  const esManual = ctx.approvalMode === "manual";

  const { data: factura, error: errorFactura } = await ctx.admin
    .from("invoices")
    .insert({
      owner_id: ctx.tecnico.owner_id,
      entity_id: ctx.tecnico.entity_id,
      client_id: cotizacion.client_id,
      technician_id: ctx.tecnico.id,
      numero,
      subtotal: cotizacion.subtotal,
      ivu_pct: cotizacion.ivu_pct,
      ivu_monto: cotizacion.ivu_monto,
      retencion_pct: 0,
      retencion_monto: 0,
      total: cotizacion.total,
      deposito_monto: cotizacion.deposito_monto ?? 0,
      estado: esManual ? "borrador" : "enviada",
      pendiente_revision_tecnico: esManual,
      fecha_emision: new Date().toISOString().slice(0, 10),
      notas: `Convertida de cotización ${cotizacion.numero}.${cotizacion.notas ? " " + cotizacion.notas : ""}`,
    })
    .select("id, numero")
    .single();

  if (errorFactura || !factura) {
    return NextResponse.json({ error: errorFactura?.message ?? "No se pudo crear la factura." }, { status: 500 });
  }

  if (items && items.length > 0) {
    const { error: errorItems } = await ctx.admin.from("invoice_items").insert(
      items.map((it) => ({
        invoice_id: factura.id,
        descripcion: it.descripcion,
        detalle: it.detalle,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        subtotal_linea: it.subtotal_linea ?? it.cantidad * it.precio_unitario,
        service_id: it.service_id,
      }))
    );
    if (errorItems) return NextResponse.json({ error: errorItems.message }, { status: 500 });
  }

  const { error: errorUpdate } = await ctx.admin
    .from("cotizaciones")
    .update({ estado: "convertida", invoice_id: factura.id })
    .eq("id", cotizacion.id);
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 });

  return NextResponse.json({ ok: true, invoiceId: factura.id, numero: factura.numero });
}
