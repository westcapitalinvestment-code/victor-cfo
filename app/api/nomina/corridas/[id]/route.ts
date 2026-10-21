import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNominaPorFila, registrarNomina } from "@/lib/nomina-server";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const a = await actorNominaPorFila(supabase, "payroll_runs", params.id);
  if ("error" in a) return a.error;
  const { g } = a;
  const { data: run } = await g.db.from("payroll_runs").select("*").eq("id", params.id).eq("owner_id", g.userId).maybeSingle();
  if (!run) return NextResponse.json({ error: "Corrida no encontrada." }, { status: 404 });
  const { data: lineas } = await g.db.from("payroll_run_lines").select("*").eq("run_id", params.id).order("created_at");
  return NextResponse.json({ ok: true, corrida: run, lineas: lineas ?? [] });
}

// El DUEÑO autoriza o rechaza una corrida que dejó el contable pendiente.
// Aprobar: pasa a 'aprobada' y desde ahí cuenta en los acumulados del año.
// Rechazar: se elimina la corrida pendiente (no había afectado ningún acumulado).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const a = await actorNominaPorFila(supabase, "payroll_runs", params.id);
  if ("error" in a) return a.error;
  const { g, entityId } = a;
  if (g.actor !== "dueno") return NextResponse.json({ error: "Solo el dueño puede aprobar o rechazar una corrida." }, { status: 403 });
  const body = await req.json().catch(() => null);
  const accion = String(body?.accion ?? "");
  if (accion !== "aprobar" && accion !== "rechazar") return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  const { data: run } = await g.db.from("payroll_runs").select("id, estado, periodo_inicio, periodo_fin").eq("id", params.id).eq("owner_id", g.userId).maybeSingle();
  if (!run) return NextResponse.json({ error: "Corrida no encontrada." }, { status: 404 });
  if (run.estado !== "pendiente") return NextResponse.json({ error: "Esta corrida no está pendiente de aprobación." }, { status: 409 });
  if (accion === "aprobar") {
    const { error } = await g.db
      .from("payroll_runs")
      .update({ estado: "aprobada", aprobada_por: g.email, aprobada_en: new Date().toISOString() })
      .eq("id", params.id)
      .eq("owner_id", g.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await registrarNomina(g, entityId, "corrida_aprobada_por_dueno", { run_id: params.id, periodo: `${run.periodo_inicio} a ${run.periodo_fin}` });
    return NextResponse.json({ ok: true, estado: "aprobada" });
  }
  const { error } = await g.db.from("payroll_runs").delete().eq("id", params.id).eq("owner_id", g.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await registrarNomina(g, entityId, "corrida_rechazada_por_dueno", { run_id: params.id, periodo: `${run.periodo_inicio} a ${run.periodo_fin}` });
  return NextResponse.json({ ok: true, rechazada: true });
}

// Borrar una corrida aprobada devuelve los acumulados del año al estado anterior.
// El contable solo puede borrar corridas pendientes (o cualquiera si el dueño le dio aprobación directa).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const a = await actorNominaPorFila(supabase, "payroll_runs", params.id);
  if ("error" in a) return a.error;
  const { g, entityId } = a;
  const { data: run } = await g.db.from("payroll_runs").select("estado, periodo_inicio, periodo_fin").eq("id", params.id).eq("owner_id", g.userId).maybeSingle();
  if (!run) return NextResponse.json({ error: "Corrida no encontrada." }, { status: 404 });
  if (g.actor === "contable" && run.estado === "aprobada" && !g.apruebaDirecto) {
    return NextResponse.json({ error: "Una corrida aprobada solo la puede eliminar el dueño." }, { status: 403 });
  }
  const { error } = await g.db.from("payroll_runs").delete().eq("id", params.id).eq("owner_id", g.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await registrarNomina(g, entityId, "corrida_eliminada", { run_id: params.id, estado: run.estado, periodo: `${run.periodo_inicio} a ${run.periodo_fin}` });
  return NextResponse.json({ ok: true });
}
