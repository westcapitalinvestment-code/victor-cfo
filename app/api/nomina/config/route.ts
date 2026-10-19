import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { entidadDelUsuario, exigirNomina } from "@/lib/nomina-server";

// Tasas propias de la entidad: SUTA (la asigna el DTRH), CFSE (por póliza) y si
// aplica FUTA. Las tasas generales (FICA, SINOT, topes) viven en payroll_params.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const g = await exigirNomina(supabase);
  if ("error" in g) return g.error;
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  if (!(await entidadDelUsuario(supabase, g.userId, entityId))) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }
  const { data } = await supabase.from("payroll_entity_config").select("*").eq("entity_id", entityId).maybeSingle();
  return NextResponse.json({ ok: true, config: data ?? null });
}

const tasa = (v: unknown, max: number): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error("Tasa fuera de rango.");
  return n;
};

export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const g = await exigirNomina(supabase);
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const entityId = String(body.entityId ?? "");
  if (!(await entidadDelUsuario(supabase, g.userId, entityId))) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }
  let sutaTasa: number | null | undefined;
  let cfseTasa: number | null | undefined;
  try {
    // El formulario manda porcentajes (ej. 2.5); se guardan como fracción (0.025).
    const s = body.suta_pct === undefined ? undefined : body.suta_pct === null || body.suta_pct === "" ? null : Number(body.suta_pct) / 100;
    const c = body.cfse_pct === undefined ? undefined : body.cfse_pct === null || body.cfse_pct === "" ? null : Number(body.cfse_pct) / 100;
    sutaTasa = tasa(s, 0.2);
    cfseTasa = tasa(c, 0.5);
  } catch {
    return NextResponse.json({ error: "Escribe un porcentaje válido." }, { status: 400 });
  }
  const fila: Record<string, unknown> = { entity_id: entityId, owner_id: g.userId, updated_at: new Date().toISOString() };
  if (sutaTasa !== undefined) fila.suta_tasa = sutaTasa;
  if (cfseTasa !== undefined) fila.cfse_tasa = cfseTasa;
  if (body.cfse_poliza !== undefined) fila.cfse_poliza = String(body.cfse_poliza ?? "").slice(0, 60) || null;
  if (body.cfse_codigo_riesgo !== undefined) fila.cfse_codigo_riesgo = String(body.cfse_codigo_riesgo ?? "").slice(0, 60) || null;
  if (body.futa_aplica !== undefined) fila.futa_aplica = !!body.futa_aplica;
  const { data, error } = await supabase.from("payroll_entity_config").upsert(fila, { onConflict: "entity_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, config: data });
}
