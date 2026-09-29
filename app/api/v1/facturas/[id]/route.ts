import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autenticarApiKey, tieneScope } from "@/lib/api-auth";

// GET /api/v1/facturas/:id — detalle de una factura con sus líneas. Ver
// API.md en la raíz del proyecto.

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = await autenticarApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!tieneScope(auth.scopes, "facturas:leer")) {
    return NextResponse.json({ error: "Esta API key no tiene el scope 'facturas:leer'." }, { status: 403 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("invoices")
    .select(
      "id, numero, client_id, subtotal, ivu_pct, ivu_monto, retencion_pct, retencion_monto, total, estado, fecha_emision, fecha_vencimiento, fecha_pago, notas, clients(name, email)"
    )
    .eq("id", params.id)
    .eq("owner_id", auth.ownerId);
  if (auth.entityId) query = query.eq("entity_id", auth.entityId);

  const { data: factura, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Aislamiento entre cuentas: si no aparece con este owner_id (y entity_id
  // si la key está fija), es un 404 — nunca se revela si existe bajo otra
  // cuenta.
  if (!factura) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });

  const { data: items } = await admin
    .from("invoice_items")
    .select("id, descripcion, detalle, cantidad, precio_unitario, subtotal_linea, service_id")
    .eq("invoice_id", factura.id);

  return NextResponse.json({
    data: {
      id: factura.id,
      numero: factura.numero,
      cliente_id: factura.client_id,
      cliente_nombre: (factura.clients as { name?: string } | null)?.name ?? null,
      cliente_email: (factura.clients as { email?: string } | null)?.email ?? null,
      subtotal: factura.subtotal,
      ivu_pct: factura.ivu_pct,
      ivu_monto: factura.ivu_monto,
      retencion_pct: factura.retencion_pct,
      retencion_monto: factura.retencion_monto,
      total: factura.total,
      estado: factura.estado,
      fecha_emision: factura.fecha_emision,
      fecha_vencimiento: factura.fecha_vencimiento,
      fecha_pago: factura.fecha_pago,
      notas: factura.notas,
      lineas: (items ?? []).map((i) => ({
        id: i.id,
        descripcion: i.descripcion,
        detalle: i.detalle,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        subtotal_linea: i.subtotal_linea,
        servicio_id: i.service_id,
      })),
    },
  });
}
