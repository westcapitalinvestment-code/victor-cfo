import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Listar las importaciones de CSV de pagos a contratistas hechas para una
// entidad (30 sept 2026) — mismo patrón que
// /api/facturas/csv/importaciones. Cada corrida de /api/pagos/csv/importar
// marca sus filas con el mismo import_batch_id — aquí se agrupan para
// mostrar un historial: cuándo se subió, cuántos pagos trajo y el total en
// dólares, para que Joel reconozca cuál importación fue la equivocada
// antes de borrarla.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const entityId = req.nextUrl.searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "Falta la entidad." }, { status: 400 });

  const { data: entidad } = await supabase.from("business_entities").select("id").eq("id", entityId).eq("owner_id", user.id).maybeSingle();
  if (!entidad) return NextResponse.json({ error: "No se encontró esa entidad." }, { status: 404 });

  const { data: retenciones } = await supabase
    .from("vendor_retenciones")
    .select("import_batch_id, gross_amount, created_at, vendor_id, vendors(name)")
    .eq("entity_id", entityId)
    .eq("owner_id", user.id)
    .not("import_batch_id", "is", null)
    .order("created_at", { ascending: false });

  type Grupo = {
    batchId: string;
    fecha: string;
    cantidad: number;
    total: number;
    contratistas: Set<string>;
  };

  const grupos = new Map<string, Grupo>();
  for (const r of retenciones ?? []) {
    const batchId = r.import_batch_id as string;
    if (!grupos.has(batchId)) {
      grupos.set(batchId, { batchId, fecha: r.created_at as string, cantidad: 0, total: 0, contratistas: new Set() });
    }
    const g = grupos.get(batchId)!;
    g.cantidad++;
    g.total += Number(r.gross_amount) || 0;
    const nombreContratista = (r as unknown as { vendors?: { name?: string } }).vendors?.name;
    if (nombreContratista) g.contratistas.add(nombreContratista);
    if (r.created_at && r.created_at < g.fecha) g.fecha = r.created_at as string;
  }

  const importaciones = Array.from(grupos.values())
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .map((g) => ({
      batchId: g.batchId,
      fecha: g.fecha,
      cantidad: g.cantidad,
      total: Math.round(g.total * 100) / 100,
      contratistas: Array.from(g.contratistas).slice(0, 5),
      contratistasTotal: g.contratistas.size,
    }));

  return NextResponse.json({ importaciones });
}
