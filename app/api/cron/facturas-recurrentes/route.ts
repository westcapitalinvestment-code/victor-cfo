import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaHoyPR } from "@/lib/hora-pr";

// Cron diario — genera automáticamente la siguiente factura de cada
// "plantilla recurrente" (invoices.es_recurrente = true) cuando llega su
// fecha_proxima_generacion. La plantilla original NUNCA se toca más allá
// de avanzar esa fecha; cada ciclo crea una factura NUEVA (borrador, para
// que el dueño la revise/envíe) con factura_padre_id apuntando a la
// plantilla, para no perder el hilo de cuáles vinieron de cuáles.
//
// Solo se generan hijas de plantillas que ya estén "enviada"/"vista"/
// "pagada"/"vencida" (no "borrador") — si el dueño dejó la plantilla sin
// enviar nunca, no tiene sentido empezar a clonarla sola.
//
// Misma protección que los otros crons: header Authorization con
// CRON_SECRET, cliente admin porque itera TODOS los usuarios sin sesión.
export const maxDuration = 300;

function avanzarFecha(fechaISO: string, frecuencia: string): string {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  if (frecuencia === "semanal") d.setUTCDate(d.getUTCDate() + 7);
  else if (frecuencia === "quincenal") d.setUTCDate(d.getUTCDate() + 15);
  else d.setUTCMonth(d.getUTCMonth() + 1); // mensual (default)
  return d.toISOString().slice(0, 10);
}

function diasEntre(desdeISO: string, hastaISO: string): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((new Date(`${hastaISO}T00:00:00Z`).getTime() - new Date(`${desdeISO}T00:00:00Z`).getTime()) / MS_POR_DIA);
}

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const hoyISO = fechaHoyPR();

  const { data: plantillas, error: plantillasError } = await supabase
    .from("invoices")
    .select(
      "id, owner_id, entity_id, client_id, servicio_id, subtotal, ivu_pct, ivu_monto, retencion_pct, retencion_monto, total, estado, fecha_emision, fecha_vencimiento, notas, metodos_cobro_aceptados, late_fee_habilitado, late_fee_tipo, late_fee_monto, late_fee_dias_gracia, frecuencia_recurrente, fecha_proxima_generacion"
    )
    .eq("es_recurrente", true)
    .neq("estado", "borrador")
    .lte("fecha_proxima_generacion", hoyISO);

  if (plantillasError) return NextResponse.json({ error: plantillasError.message }, { status: 500 });
  if (!plantillas || plantillas.length === 0) return NextResponse.json({ ok: true, generadas: 0 });

  let generadas = 0;
  const resultados: Record<string, unknown> = {};

  for (const p of plantillas) {
    try {
      const { data: items } = await supabase
        .from("invoice_items")
        .select("descripcion, cantidad, precio_unitario, subtotal_linea")
        .eq("invoice_id", p.id);

      const { data: entidad } = await supabase
        .from("business_entities")
        .select("invoice_prefix, invoice_start_number")
        .eq("id", p.entity_id)
        .maybeSingle();

      const { count } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", p.owner_id)
        .eq("entity_id", p.entity_id);

      const numero = entidad ? `${entidad.invoice_prefix}-${entidad.invoice_start_number + (count ?? 0)}` : `REC-${Date.now()}`;
      const diasVencimiento = p.fecha_vencimiento ? diasEntre(p.fecha_emision, p.fecha_vencimiento) : 30;
      const nuevaFechaVencimiento = new Date(`${hoyISO}T00:00:00Z`);
      nuevaFechaVencimiento.setUTCDate(nuevaFechaVencimiento.getUTCDate() + diasVencimiento);

      const { data: nuevaFactura, error: insertError } = await supabase
        .from("invoices")
        .insert({
          owner_id: p.owner_id,
          entity_id: p.entity_id,
          client_id: p.client_id,
          servicio_id: p.servicio_id,
          numero,
          subtotal: p.subtotal,
          ivu_pct: p.ivu_pct,
          ivu_monto: p.ivu_monto,
          retencion_pct: p.retencion_pct,
          retencion_monto: p.retencion_monto,
          total: p.total,
          estado: "borrador",
          fecha_emision: hoyISO,
          fecha_vencimiento: nuevaFechaVencimiento.toISOString().slice(0, 10),
          notas: p.notas,
          metodos_cobro_aceptados: p.metodos_cobro_aceptados,
          late_fee_habilitado: p.late_fee_habilitado,
          late_fee_tipo: p.late_fee_tipo,
          late_fee_monto: p.late_fee_monto,
          late_fee_dias_gracia: p.late_fee_dias_gracia,
          factura_padre_id: p.id,
          es_recurrente: false,
        })
        .select("id")
        .single();

      if (insertError || !nuevaFactura) {
        resultados[p.id] = { generada: false, error: insertError?.message };
        continue;
      }

      if (items && items.length > 0) {
        await supabase.from("invoice_items").insert(
          items.map((it) => ({
            invoice_id: nuevaFactura.id,
            descripcion: it.descripcion,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            subtotal_linea: it.subtotal_linea,
          }))
        );
      }

      await supabase
        .from("invoices")
        .update({ fecha_proxima_generacion: avanzarFecha(p.fecha_proxima_generacion as string, p.frecuencia_recurrente ?? "mensual") })
        .eq("id", p.id);

      generadas++;
      resultados[p.id] = { generada: true, nuevaFacturaId: nuevaFactura.id, numero };
    } catch (err) {
      resultados[p.id] = { generada: false, error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }

  return NextResponse.json({ ok: true, generadas, resultados });
}
