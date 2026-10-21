import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNomina, calcularCorrida, registrarNomina, type EntradaCorrida } from "@/lib/nomina-server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;
  const { data, error } = await g.db
    .from("payroll_runs")
    .select("id, anio, frecuencia, periodo_inicio, periodo_fin, fecha_pago, estado, totales, depositos, created_at, creada_por, creada_por_rol, aprobada_por, aprobada_en")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .order("fecha_pago", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, corridas: data ?? [] });
}

// Guarda (aprueba) una corrida. Se recalcula TODO en el servidor y se guarda
// una foto de las tasas usadas para poder auditarla después.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = (await req.json().catch(() => null)) as EntradaCorrida | null;
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const a = await actorNomina(supabase, String(body.entityId ?? ""));
  if ("error" in a) return a.error;
  const { g } = a;
  // Contable sin permiso de aprobar directo → la corrida queda pendiente del dueño.
  const estadoNuevo = g.actor === "contable" && !g.apruebaDirecto ? "pendiente" : "aprobada";

  // Evita guardar dos veces el mismo periodo (duplicaría los acumulados del año).
  const { data: dup } = await g.db
    .from("payroll_runs")
    .select("id")
    .eq("owner_id", g.userId)
    .eq("entity_id", body.entityId)
    .eq("frecuencia", body.frecuencia)
    .eq("periodo_inicio", body.periodoInicio)
    .eq("periodo_fin", body.periodoFin)
    .maybeSingle();
  if (dup) {
    return NextResponse.json(
      { error: "Ya existe una corrida guardada para ese periodo. Elimínala primero si quieres rehacerla." },
      { status: 409 }
    );
  }

  let r: Awaited<ReturnType<typeof calcularCorrida>>;
  try {
    r = await calcularCorrida(g.db, g.userId, body);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo calcular la nómina." }, { status: 500 });
  }
  if (!r.resultado) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  const res = r.resultado;
  if (!res.asientoCuadra) return NextResponse.json({ error: "El asiento contable no cuadra; no se guardó la corrida." }, { status: 500 });

  const { data: run, error } = await g.db
    .from("payroll_runs")
    .insert({
      owner_id: g.userId,
      entity_id: body.entityId,
      anio: res.anio,
      frecuencia: body.frecuencia,
      periodo_inicio: body.periodoInicio,
      periodo_fin: body.periodoFin,
      fecha_pago: body.fechaPago,
      estado: estadoNuevo,
      creada_por: g.email,
      creada_por_rol: g.actor === "contable" ? "contable" : "dueno",
      aprobada_por: estadoNuevo === "aprobada" ? g.email : null,
      aprobada_en: estadoNuevo === "aprobada" ? new Date().toISOString() : null,
      totales: res.resumen.totales,
      depositos: { ...res.resumen.depositos, ...res.vencimiento },
      asiento: res.resumen.asiento,
      advertencias: res.resumen.advertencias,
      parametros_usados: res.parametrosUsados,
    })
    .select("id")
    .single();
  if (error || !run) return NextResponse.json({ error: error?.message ?? "No se pudo guardar." }, { status: 500 });

  const filas = res.lineas.map((l) => ({
    run_id: run.id,
    owner_id: g.userId,
    entity_id: body.entityId,
    employee_id: l.employeeId,
    anio: res.anio,
    entrada: l.entrada,
    bruto: l.bruto,
    neto: l.neto,
    ss_emp: l.ssEmp,
    medicare_emp: l.medicareEmp,
    medicare_adic: l.medicareAdic,
    hacienda: l.hacienda,
    sinot_emp: l.sinotEmp,
    choferil: l.choferil,
    otras_deducciones: l.deduccionMedico + l.aporte401k + l.otrasDeducciones,
    ss_pat: l.ssPat,
    medicare_pat: l.medicarePat,
    futa: l.futa,
    suta: l.suta,
    sinot_pat: l.sinotPat,
    cfse: l.cfse,
    base_ss: l.baseSs,
    base_suta: l.baseSuta,
    base_futa: l.baseFuta,
    base_sinot: l.baseSinot,
    detalle: l,
  }));
  const { error: errLineas } = await g.db.from("payroll_run_lines").insert(filas);
  if (errLineas) {
    await g.db.from("payroll_runs").delete().eq("id", run.id); // no dejar una corrida a medias
    return NextResponse.json({ error: errLineas.message }, { status: 500 });
  }
  await registrarNomina(g, body.entityId, estadoNuevo === "pendiente" ? "corrida_enviada_a_aprobacion" : "corrida_aprobada", {
    run_id: run.id,
    periodo: `${body.periodoInicio} a ${body.periodoFin}`,
    bruto: res.resumen.totales.bruto,
  });
  return NextResponse.json({ ok: true, id: run.id, estado: estadoNuevo });
}
