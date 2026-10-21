import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNomina, registrarNomina } from "@/lib/nomina-server";
import { mesesTrabajados, reglasLic, saldoLic, tarifaDiaria, type MovLic } from "@/lib/nomina-licencias";

// Liquidación al salir (21 oct 2026): estimado del pago de vacaciones acumuladas no
// usadas con las reglas configurables de la entidad. La enfermedad no se paga por
// defecto (el patrono decide). VICTOR solo calcula: el pago se hace en una corrida
// (campo «Bonos») y el patrono/contable confirma qué corresponde por ley.
const r2 = (v: number) => Math.round(v * 100) / 100;

async function cargar(g: { db: any; userId: string }, entityId: string, employeeId: string, salida: string) {
  const { data: emp } = await g.db
    .from("payroll_employees")
    .select("id, nombre, tipo_pago, tarifa, frecuencia, fecha_ingreso, activo, fecha_salida")
    .eq("id", employeeId)
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .maybeSingle();
  return emp as null | {
    id: string; nombre: string; tipo_pago: string; tarifa: number; frecuencia: string;
    fecha_ingreso: string | null; activo: boolean; fecha_salida: string | null;
  };
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const sp = req.nextUrl.searchParams;
  const entityId = sp.get("entityId") ?? "";
  const employeeId = sp.get("employeeId") ?? "";
  const salida = sp.get("fechaSalida") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(salida)) return NextResponse.json({ error: "Fecha de salida inválida." }, { status: 400 });
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;
  const emp = await cargar(g, entityId, employeeId, salida);
  if (!emp) return NextResponse.json({ error: "Empleado no encontrado." }, { status: 404 });

  const { data: cfg } = await g.db.from("payroll_entity_config").select("*").eq("entity_id", entityId).maybeSingle();
  const reglas = reglasLic(cfg);
  const { data: movs } = await g.db
    .from("payroll_leave")
    .select("tipo, movimiento, dias, fecha")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .eq("employee_id", employeeId)
    .lte("fecha", salida);
  const meses = mesesTrabajados(emp.fecha_ingreso, new Date(salida + "T00:00:00"));
  const vac = saldoLic("vacaciones", meses, (movs ?? []) as MovLic[], reglas);
  const enf = saldoLic("enfermedad", meses, (movs ?? []) as MovLic[], reglas);
  const diario = tarifaDiaria(emp, reglas.horas_por_dia);
  const diasVac = Math.max(0, vac.saldo);
  return NextResponse.json({
    ok: true,
    empleado: { id: emp.id, nombre: emp.nombre, fechaIngreso: emp.fecha_ingreso, meses },
    porConfirmar: reglas.porConfirmar,
    tarifaDiaria: diario,
    vacaciones: { ...vac, dias: diasVac, monto: r2(diasVac * diario) },
    enfermedad: { ...enf, dias: Math.max(0, enf.saldo), montoSiSePaga: r2(Math.max(0, enf.saldo) * diario) },
  });
}

// Da de baja al empleado (no lo borra: conserva su historial en reportes).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const entityId = String(body.entityId ?? "");
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;
  const fecha = String(body.fechaSalida ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "Fecha de salida inválida." }, { status: 400 });
  const emp = await cargar(g, entityId, String(body.employeeId ?? ""), fecha);
  if (!emp) return NextResponse.json({ error: "Empleado no encontrado." }, { status: 404 });
  const motivo = String(body.motivo ?? "").slice(0, 200) || null;
  const { error } = await g.db
    .from("payroll_employees")
    .update({ activo: false, fecha_salida: fecha, motivo_salida: motivo })
    .eq("id", emp.id)
    .eq("owner_id", g.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await registrarNomina(g, entityId, "empleado_desactivado", { empleado: emp.nombre, fecha_salida: fecha, motivo, liquidacion: Number(body.total) || 0 });
  return NextResponse.json({ ok: true });
}
