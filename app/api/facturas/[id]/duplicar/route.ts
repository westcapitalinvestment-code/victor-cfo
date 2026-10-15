import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fechaHoyPR } from "@/lib/hora-pr";

// Duplicar factura (15 oct 2026, auditoría vs FreshBooks) — crea un BORRADOR
// nuevo con las mismas líneas, cliente y condiciones, fecha de hoy y
// vencimiento con los mismos días de plazo. No copia pago, recurrencia,
// técnico ni nada del cobro: es una factura nueva, no un clon del historial.
//
// La autorización vive en RLS (mismo criterio que enviar-email): si Postgres
// no le devuelve la fila a este usuario, el 404 lo cubre.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const { data: f, error } = await supabase
    .from("invoices")
    .select(
      "owner_id, entity_id, client_id, servicio_id, subtotal, ivu_pct, ivu_monto, ivu_estatal_monto, ivu_municipal_monto, retencion_pct, retencion_monto, total, deposito_monto, fecha_emision, fecha_vencimiento, notas, metodos_cobro_aceptados, late_fee_habilitado, late_fee_tipo, late_fee_monto, late_fee_dias_gracia, estado, montos_originales_anulada"
    )
    .eq("id", params.id)
    .single();
  if (error || !f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });

  const { data: items } = await supabase
    .from("invoice_items")
    .select("descripcion, detalle, cantidad, precio_unitario, subtotal_linea, service_id")
    .eq("invoice_id", params.id);

  // Si la original está anulada sus montos están en 0 — se recuperan los
  // originales para que el duplicado sirva de verdad.
  const orig = (f.estado === "anulada" && f.montos_originales_anulada ? f.montos_originales_anulada : null) as Record<
    string,
    number | null
  > | null;
  const m = (k: string, actual: unknown): number => Number(orig ? orig[k] ?? 0 : actual ?? 0);

  const { data: entidad } = await supabase
    .from("business_entities")
    .select("invoice_prefix, invoice_start_number")
    .eq("id", f.entity_id)
    .maybeSingle();

  const { count } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", f.owner_id)
    .eq("entity_id", f.entity_id);

  // Número consecutivo; si por borrados previos ya existe, sube hasta que esté libre.
  let n = (entidad?.invoice_start_number ?? 1) + (count ?? 0);
  const prefijo = entidad?.invoice_prefix ?? "INV";
  let numero = `${prefijo}-${n}`;
  for (let i = 0; i < 50; i++) {
    const { count: existe } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", f.owner_id)
      .eq("numero", numero);
    if (!existe) break;
    n++;
    numero = `${prefijo}-${n}`;
  }

  const hoy = fechaHoyPR();
  let vence: string | null = null;
  if (f.fecha_vencimiento && f.fecha_emision) {
    const dias = Math.max(
      0,
      Math.round(
        (new Date(`${f.fecha_vencimiento}T00:00:00Z`).getTime() - new Date(`${f.fecha_emision}T00:00:00Z`).getTime()) / 86400000
      )
    );
    const d = new Date(`${hoy}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    vence = d.toISOString().slice(0, 10);
  }

  const { data: nueva, error: insErr } = await supabase
    .from("invoices")
    .insert({
      owner_id: f.owner_id,
      entity_id: f.entity_id,
      client_id: f.client_id,
      servicio_id: f.servicio_id,
      numero,
      subtotal: m("subtotal", f.subtotal),
      ivu_pct: f.ivu_pct,
      ivu_monto: m("ivu_monto", f.ivu_monto),
      ivu_estatal_monto: m("ivu_estatal_monto", f.ivu_estatal_monto),
      ivu_municipal_monto: m("ivu_municipal_monto", f.ivu_municipal_monto),
      retencion_pct: f.retencion_pct,
      retencion_monto: m("retencion_monto", f.retencion_monto),
      total: m("total", f.total),
      deposito_monto: m("deposito_monto", f.deposito_monto),
      estado: "borrador",
      fecha_emision: hoy,
      fecha_vencimiento: vence,
      notas: f.notas,
      metodos_cobro_aceptados: f.metodos_cobro_aceptados,
      late_fee_habilitado: f.late_fee_habilitado,
      late_fee_tipo: f.late_fee_tipo,
      late_fee_monto: f.late_fee_monto,
      late_fee_dias_gracia: f.late_fee_dias_gracia,
      es_recurrente: false,
    })
    .select("id")
    .single();

  if (insErr || !nueva) return NextResponse.json({ error: insErr?.message ?? "No se pudo duplicar." }, { status: 500 });

  if (items && items.length > 0) {
    const { error: itemsErr } = await supabase.from("invoice_items").insert(
      items.map((it) => ({
        invoice_id: nueva.id,
        descripcion: it.descripcion,
        detalle: it.detalle,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        subtotal_linea: it.subtotal_linea,
        service_id: it.service_id,
      }))
    );
    if (itemsErr) {
      await supabase.from("invoices").delete().eq("id", nueva.id);
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: nueva.id, numero });
}
