import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Deshacer una importación de CSV de facturas completa (migración 0074, 7
// sept 2026 — mismo patrón que /api/cuentas/estado/[id] para deshacer una
// subida de estado de cuenta). Borrar las invoices de este batch cascada
// automáticamente a sus invoice_items (FK ON DELETE CASCADE) — no borra
// nada que no haya creado exactamente esa corrida de importación.
export async function DELETE(req: NextRequest, { params }: { params: { batchId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { batchId } = params;

  const { data: facturas } = await supabase
    .from("invoices")
    .select("id")
    .eq("import_batch_id", batchId)
    .eq("owner_id", user.id);

  if (!facturas || facturas.length === 0) {
    return NextResponse.json({ error: "No se encontró esa importación." }, { status: 404 });
  }

  const { error: errorBorrar } = await supabase.from("invoices").delete().eq("import_batch_id", batchId).eq("owner_id", user.id);
  if (errorBorrar) {
    return NextResponse.json({ error: `No se pudo deshacer la importación: ${errorBorrar.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, facturasBorradas: facturas.length });
}
