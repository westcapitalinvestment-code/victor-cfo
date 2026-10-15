import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Quitar el recargo por mora de una factura (resta del total y no se reaplica).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const { data: f } = await supabase
    .from("invoices")
    .select("id, total, estado, recargo_mora_monto")
    .eq("id", params.id)
    .single();
  if (!f) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  if (f.estado === "pagada") return NextResponse.json({ error: "La factura ya está pagada." }, { status: 400 });

  const fee = Number(f.recargo_mora_monto ?? 0);
  const nuevo = Math.max(0, Math.round((Number(f.total) - fee) * 100) / 100);
  const { error } = await supabase
    .from("invoices")
    .update({ total: nuevo, recargo_mora_monto: 0, recargo_mora_quitado: true })
    .eq("id", f.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, total: nuevo });
}
