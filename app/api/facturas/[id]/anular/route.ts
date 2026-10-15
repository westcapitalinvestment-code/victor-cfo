import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Anular factura (void) — 15 oct 2026. El número NO se reutiliza y la factura
// no se borra (queda para auditoría y para el contable), pero deja de contar:
// los montos pasan a 0 (los originales se guardan aparte), así ningún reporte
// de cobrado/pendiente/IVU/retención se contamina.
//
// Solo facturas NO pagadas. Una factura ya cobrada se corrige con una nota de
// crédito / reembolso (/api/facturas/[id]/nota-credito), nunca anulándola.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 300) : "";

  const { data: f, error } = await supabase
    .from("invoices")
    .select("id, estado, subtotal, ivu_monto, ivu_estatal_monto, ivu_municipal_monto, retencion_monto, total, deposito_monto")
    .eq("id", params.id)
    .single();
  if (error || !f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });

  if (f.estado === "pagada") {
    return NextResponse.json(
      { error: "Esta factura ya está pagada. Para corregirla usa una nota de crédito o un reembolso." },
      { status: 400 }
    );
  }
  if (f.estado === "anulada") return NextResponse.json({ error: "La factura ya está anulada." }, { status: 400 });

  const { error: upErr } = await supabase
    .from("invoices")
    .update({
      estado: "anulada",
      anulada_en: new Date().toISOString(),
      anulada_motivo: motivo || null,
      montos_originales_anulada: {
        subtotal: f.subtotal,
        ivu_monto: f.ivu_monto,
        ivu_estatal_monto: f.ivu_estatal_monto,
        ivu_municipal_monto: f.ivu_municipal_monto,
        retencion_monto: f.retencion_monto,
        total: f.total,
        deposito_monto: f.deposito_monto,
      },
      subtotal: 0,
      ivu_monto: 0,
      ivu_estatal_monto: 0,
      ivu_municipal_monto: 0,
      retencion_monto: 0,
      total: 0,
      deposito_monto: 0,
      es_recurrente: false,
      fecha_proxima_generacion: null,
    })
    .eq("id", f.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
