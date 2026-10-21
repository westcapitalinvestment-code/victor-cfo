import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNominaPorFila, calcularCorrida, filasDeLineas, registrarNomina, type EntradaCorrida } from "@/lib/nomina-server";

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

// Corregir una corrida ya guardada (p. ej. se entró mal un empleado). Una corrida es
// solo el cálculo —VICTOR no paga ni deposita—, así que se recalcula con las entradas
// nuevas y reemplaza a la anterior. Dueño: cualquier corrida. Contable: las pendientes,
// o cualquiera si el dueño le dio aprobación directa. Las corridas POSTERIORES del
// mismo año no se recalculan (si el cambio mueve algún tope, se rehacen).
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const a = await actorNominaPorFila(supabase, "payroll_runs", params.id);
  if ("error" in a) return a.error;
  const { g, entityId } = a;
  const { data: run } = await g.db.from("payroll_runs").select("id, estado").eq("id", params.id).eq("owner_id", g.userId).maybeSingle();
  if (!run) return NextResponse.json({ error: "Corrida no encontrada." }, { status: 404 });
  if (g.actor === "contable" && run.estado === "aprobada" && !g.apruebaDirecto) {
    return NextResponse.json({ error: "Una corrida aprobada solo la puede corregir el dueño." }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as EntradaCorrida | null;
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const entrada: EntradaCorrida = { ...body, entityId, runId: params.id };

  // Mismo periodo que otra corrida distinta → duplicaría los acumulados.
  const { data: dup } = await g.db
    .from("payroll_runs")
    .select("id")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .eq("frecuencia", entrada.frecuencia)
    .eq("periodo_inicio", entrada.periodoInicio)
    .eq("periodo_fin", entrada.periodoFin)
    .neq("id", params.id)
    .maybeSingle();
  if (dup) return NextResponse.json({ error: "Ya existe otra corrida guardada para ese periodo." }, { status: 409 });

  let r: Awaited<ReturnType<typeof calcularCorrida>>;
  try {
    r = await calcularCorrida(g.db, g.userId, entrada);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo calcular la nómina." }, { status: 500 });
  }
  if (!r.resultado) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  const res = r.resultado;
  if (!res.asientoCuadra) return NextResponse.json({ error: "El asiento contable no cuadra; no se guardaron los cambios." }, { status: 500 });

  // Primero se insertan las líneas nuevas; solo si salen bien se borran las viejas.
  const { data: viejas } = await g.db.from("payroll_run_lines").select("id").eq("run_id", params.id);
  const { error: errNuevas } = await g.db.from("payroll_run_lines").insert(filasDeLineas(res, params.id, g.userId, entityId));
  if (errNuevas) return NextResponse.json({ error: errNuevas.message }, { status: 500 });
  const idsViejas = (viejas ?? []).map((l) => String(l.id));
  if (idsViejas.length > 0) await g.db.from("payroll_run_lines").delete().in("id", idsViejas);

  const { error: errRun } = await g.db
    .from("payroll_runs")
    .update({
      anio: res.anio,
      frecuencia: entrada.frecuencia,
      periodo_inicio: entrada.periodoInicio,
      periodo_fin: entrada.periodoFin,
      fecha_pago: entrada.fechaPago,
      totales: res.resumen.totales,
      depositos: { ...res.resumen.depositos, ...res.vencimiento },
      asiento: res.resumen.asiento,
      advertencias: res.resumen.advertencias,
      parametros_usados: res.parametrosUsados,
      editada_por: g.email,
      editada_en: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("owner_id", g.userId);
  if (errRun) return NextResponse.json({ error: errRun.message }, { status: 500 });
  await registrarNomina(g, entityId, "corrida_editada", {
    run_id: params.id,
    periodo: `${entrada.periodoInicio} a ${entrada.periodoFin}`,
    bruto: res.resumen.totales.bruto,
  });
  return NextResponse.json({ ok: true, id: params.id, estado: run.estado });
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
