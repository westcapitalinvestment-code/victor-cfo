import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Borrar un lote completo de ventas de POS importadas (#786, 1 oct 2026) —
// "subí el archivo equivocado" o "duplicado", mismo patrón de deshacer que
// /api/pagos/csv/importaciones/[batchId] y /api/facturas/csv/importaciones/[batchId].
export async function DELETE(req: NextRequest, { params }: { params: { batchId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { error, count } = await supabase
    .from("pos_batch_uploads")
    .delete({ count: "exact" })
    .eq("import_batch_id", params.batchId)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, borrados: count ?? 0 });
}
