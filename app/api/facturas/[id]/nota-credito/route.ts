import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fechaHoyPR } from "@/lib/hora-pr";

// Nota de crédito / reembolso (15 oct 2026, auditoría vs FreshBooks).
//
// Modelo: la nota queda registrada en notas_credito (auditoría + lo que ve el
// contable) Y reduce la factura misma, repartiendo el recorte
// proporcionalmente entre subtotal, impuestos y retención. Así TODOS los
// reportes existentes (cobrado, pendiente, IVU, retención, ingresos por
// cliente) quedan correctos sin tocar cada uno.
//   · Factura NO pagada → "crédito": baja lo que el cliente debe.
//   · Factura pagada   → "reembolso": baja el ingreso cobrado; el dinero se
//     devuelve por fuera (VICTOR no mueve dinero) y se anota el método.
// Si la nota iguala el total de una factura NO pagada, queda anulada.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const { data, error } = await supabase
    .from("notas_credito")
    .select("id, numero, tipo, monto, motivo, fecha, metodo_reembolso")
    .eq("invoice_id", params.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, notas: data ?? [] });
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const monto = r2(Number(body?.monto));
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 300) : "";
  const metodo = typeof body?.metodo_reembolso === "string" ? body.metodo_reembolso.trim().slice(0, 60) : "";
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "El monto debe ser mayor que cero." }, { status: 400 });
  }

  const { data: f, error } = await supabase
    .from("invoices")
    .select(
      "id, owner_id, entity_id, client_id, numero, estado, subtotal, ivu_monto, ivu_estatal_monto, ivu_municipal_monto, retencion_monto, total, deposito_monto"
    )
    .eq("id", params.id)
    .single();
  if (error || !f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });

  if (f.estado === "anulada" || f.estado === "borrador") {
    return NextResponse.json({ error: "Una factura anulada o en borrador no admite nota de crédito." }, { status: 400 });
  }

  const total = Number(f.total);
  if (monto > total + 0.001) {
    return NextResponse.json({ error: `La nota no puede ser mayor que el total de la factura (${total.toFixed(2)}).` }, { status: 400 });
  }

  const pagada = f.estado === "pagada";
  const tipo = pagada ? "reembolso" : "credito";

  // Número consecutivo por dueño: NC-1, NC-2…
  const { count } = await supabase
    .from("notas_credito")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", f.owner_id);
  let n = (count ?? 0) + 1;
  let numero = `NC-${n}`;
  for (let i = 0; i < 50; i++) {
    const { count: existe } = await supabase
      .from("notas_credito")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", f.owner_id)
      .eq("numero", numero);
    if (!existe) break;
    n++;
    numero = `NC-${n}`;
  }

  const nuevoTotal = r2(total - monto);
  const factor = total > 0 ? nuevoTotal / total : 0;
  const escala = (v: unknown) => r2(Number(v ?? 0) * factor);

  const { error: notaErr } = await supabase.from("notas_credito").insert({
    owner_id: f.owner_id,
    entity_id: f.entity_id,
    invoice_id: f.id,
    client_id: f.client_id,
    numero,
    tipo,
    monto,
    motivo: motivo || null,
    fecha: fechaHoyPR(),
    metodo_reembolso: pagada && metodo ? metodo : null,
  });
  if (notaErr) return NextResponse.json({ error: notaErr.message }, { status: 500 });

  const completa = nuevoTotal <= 0.004;
  const cambios: Record<string, unknown> = {
    subtotal: escala(f.subtotal),
    ivu_monto: escala(f.ivu_monto),
    ivu_estatal_monto: escala(f.ivu_estatal_monto),
    ivu_municipal_monto: escala(f.ivu_municipal_monto),
    retencion_monto: escala(f.retencion_monto),
    total: nuevoTotal < 0 ? 0 : nuevoTotal,
    deposito_monto: escala(f.deposito_monto),
  };
  if (completa && !pagada) {
    cambios.estado = "anulada";
    cambios.anulada_en = new Date().toISOString();
    cambios.anulada_motivo = `Nota de crédito ${numero}${motivo ? ` — ${motivo}` : ""}`;
  }

  const { error: upErr } = await supabase.from("invoices").update(cambios).eq("id", f.id);
  if (upErr) {
    // Revertir la nota para no dejar un registro huérfano sin efecto en la factura.
    await supabase.from("notas_credito").delete().eq("owner_id", f.owner_id).eq("numero", numero);
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, numero, tipo, nuevoTotal: cambios.total });
}
