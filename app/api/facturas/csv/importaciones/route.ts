import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Listar las importaciones de CSV de facturas hechas para una entidad
// (migración 0074, 7 sept 2026 — Joel: "necesito una herramienta para
// borrar un CSV por si subí un CSV equivocado en facturas al importar").
// Cada corrida de /api/facturas/csv/importar marca sus facturas con el
// mismo import_batch_id — aquí se agrupan para mostrar un historial:
// cuándo se subió, cuántas facturas trajo, y el total en dólares, para
// que Joel pueda reconocer cuál importación fue la equivocada antes de
// borrarla.
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

  const { data: facturas } = await supabase
    .from("invoices")
    .select("import_batch_id, total, created_at, numero, client_id, clients(name)")
    .eq("entity_id", entityId)
    .eq("owner_id", user.id)
    .not("import_batch_id", "is", null)
    .order("created_at", { ascending: false });

  type Grupo = {
    batchId: string;
    fecha: string;
    cantidad: number;
    total: number;
    clientes: Set<string>;
  };

  const grupos = new Map<string, Grupo>();
  for (const f of facturas ?? []) {
    const batchId = f.import_batch_id as string;
    if (!grupos.has(batchId)) {
      grupos.set(batchId, { batchId, fecha: f.created_at as string, cantidad: 0, total: 0, clientes: new Set() });
    }
    const g = grupos.get(batchId)!;
    g.cantidad++;
    g.total += Number(f.total) || 0;
    const nombreCliente = (f as unknown as { clients?: { name?: string } }).clients?.name;
    if (nombreCliente) g.clientes.add(nombreCliente);
    // created_at más viejo de la corrida = mejor estimado de "cuándo se subió"
    if (f.created_at && f.created_at < g.fecha) g.fecha = f.created_at as string;
  }

  const importaciones = Array.from(grupos.values())
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
    .map((g) => ({
      batchId: g.batchId,
      fecha: g.fecha,
      cantidad: g.cantidad,
      total: Math.round(g.total * 100) / 100,
      clientes: Array.from(g.clientes).slice(0, 5),
      clientesTotal: g.clientes.size,
    }));

  return NextResponse.json({ importaciones });
}
