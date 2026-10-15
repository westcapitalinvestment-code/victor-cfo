import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaHoyPR } from "@/lib/hora-pr";

// Recargo por mora automático: a facturas con late_fee_habilitado que ya pasaron
// vencimiento + días de gracia se les suma el recargo al total (una sola vez).
// El dueño lo puede quitar desde la factura (recargo_mora_quitado evita reaplicarlo).
export const maxDuration = 300;
const MS_DIA = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const supabase = createAdminClient();
  const hoy = fechaHoyPR();

  const { data: facturas, error } = await supabase
    .from("invoices")
    .select("id, total, fecha_vencimiento, late_fee_tipo, late_fee_monto, late_fee_dias_gracia")
    .eq("late_fee_habilitado", true)
    .eq("recargo_mora_quitado", false)
    .eq("recargo_mora_monto", 0)
    .in("estado", ["enviada", "vista", "vencida"])
    .gt("total", 0)
    .gt("late_fee_monto", 0)
    .lt("fecha_vencimiento", hoy);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let aplicados = 0;
  for (const f of facturas ?? []) {
    const dias = Math.round((new Date(`${hoy}T00:00:00Z`).getTime() - new Date(`${f.fecha_vencimiento}T00:00:00Z`).getTime()) / MS_DIA);
    if (dias <= Number(f.late_fee_dias_gracia ?? 0)) continue;
    const total = Number(f.total);
    const base = Number(f.late_fee_monto);
    const fee = Math.round((f.late_fee_tipo === "porcentaje" ? (total * base) / 100 : base) * 100) / 100;
    if (!(fee > 0)) continue;
    const { error: upErr } = await supabase
      .from("invoices")
      .update({ total: Math.round((total + fee) * 100) / 100, recargo_mora_monto: fee })
      .eq("id", f.id)
      .eq("recargo_mora_monto", 0);
    if (!upErr) aplicados++;
  }
  return NextResponse.json({ ok: true, aplicados });
}
