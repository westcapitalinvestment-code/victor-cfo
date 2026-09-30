import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Deshacer una importación de CSV de pagos a contratistas completa (30
// sept 2026) — mismo patrón que /api/facturas/csv/importaciones/[batchId].
// Solo borra las vendor_retenciones de este batch — nunca borra el
// contratista (vendor) en sí, aunque se haya creado durante esa misma
// importación, porque podría tener otros pagos registrados después a mano.
export async function DELETE(req: NextRequest, { params }: { params: { batchId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { batchId } = params;

  const { data: retenciones } = await supabase
    .from("vendor_retenciones")
    .select("id")
    .eq("import_batch_id", batchId)
    .eq("owner_id", user.id);

  if (!retenciones || retenciones.length === 0) {
    return NextResponse.json({ error: "No se encontró esa importación." }, { status: 404 });
  }

  const { error: errorBorrar } = await supabase.from("vendor_retenciones").delete().eq("import_batch_id", batchId).eq("owner_id", user.id);
  if (errorBorrar) {
    return NextResponse.json({ error: `No se pudo deshacer la importación: ${errorBorrar.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pagosBorrados: retenciones.length });
}
