import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Formularios 480.6SP que el contable subió desde su portal (16 oct 2026).
// Viven como documentos de Documentos (tipo "480.6SP", subido_por_contable), y
// aquí el dueño los ve junto a Reportes de Pagos. La RLS limita a sus
// documentos; ?entityId= filtra por entidad (sin él, todas las suyas).
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const entityId = req.nextUrl.searchParams.get("entityId");
  let q = supabase
    .from("documents")
    .select("id, nombre, created_at, subido_por_contable, subido_por_email")
    .eq("tipo", "480.6SP")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (entityId && entityId !== "null") q = q.eq("entity_id", entityId);
  const { data: docs, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (docs ?? []).map((d) => d.id);
  const archivos: Record<string, { id: string; etiqueta: string | null }[]> = {};
  if (ids.length) {
    const { data: files } = await supabase
      .from("document_files")
      .select("id, document_id, etiqueta, orden")
      .in("document_id", ids)
      .order("orden", { ascending: true });
    for (const f of files ?? []) (archivos[f.document_id] ??= []).push({ id: f.id, etiqueta: f.etiqueta });
  }
  return NextResponse.json({ documentos: (docs ?? []).map((d) => ({ ...d, archivos: archivos[d.id] ?? [] })) });
}
