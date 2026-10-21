import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNomina } from "@/lib/nomina-server";

// Bono de Navidad (21 oct 2026): calcula, por empleado, el bono sugerido con las
// reglas CONFIGURABLES de la entidad (payroll_entity_config.bono_*; vacío = sugerencia
// por defecto marcada "por confirmar"). Salarios y horas salen de las corridas
// aprobadas del período. VICTOR solo sugiere: el monto final se edita antes de
// aplicarlo al campo «Bonos» de la corrida y el patrono/contable lo confirma.
const DEFAULTS = { pct: 0.06, tope: 600, horasMin: 700, inicio: "10-01", fin: "09-30", fechaPago: "12-15" };

const n = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;

  const anio = Number(req.nextUrl.searchParams.get("anio")) || new Date().getFullYear();
  const { data: cfg } = await g.db.from("payroll_entity_config").select("*").eq("entity_id", entityId).maybeSingle();
  const usado = {
    activo: cfg?.bono_activo ?? true,
    pct: cfg?.bono_pct ?? DEFAULTS.pct,
    tope: cfg?.bono_tope ?? DEFAULTS.tope,
    horasMin: cfg?.bono_horas_min ?? DEFAULTS.horasMin,
    inicio: cfg?.bono_inicio ?? DEFAULTS.inicio,
    fin: cfg?.bono_fin ?? DEFAULTS.fin,
    fechaPago: cfg?.bono_fecha_pago ?? DEFAULTS.fechaPago,
    // true si el patrono todavía no escribió sus propios valores
    porConfirmar: cfg?.bono_pct == null || cfg?.bono_tope == null || cfg?.bono_horas_min == null,
  };

  // Período: del inicio (año anterior si el inicio es posterior al fin) hasta el fin del año pedido.
  const finISO = `${anio}-${usado.fin}`;
  const inicioAnio = usado.inicio > usado.fin ? anio - 1 : anio;
  const inicioISO = `${inicioAnio}-${usado.inicio}`;
  const fechaPago = `${anio}-${usado.fechaPago}`;

  const { data: empleados } = await g.db
    .from("payroll_employees")
    .select("id, nombre, tipo_pago, activo")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  const { data: lineas, error } = await g.db
    .from("payroll_run_lines")
    .select("employee_id, entrada, bruto, detalle, payroll_runs!inner(periodo_inicio, periodo_fin, estado)")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .eq("payroll_runs.estado", "aprobada")
    .gte("payroll_runs.periodo_fin", inicioISO)
    .lte("payroll_runs.periodo_fin", finISO)
    .limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type L = {
    employee_id: string;
    entrada: { horasRegulares?: number; horasExtra?: number } | null;
    bruto: number;
    detalle: { desglose?: { bonos?: number } } | null;
    payroll_runs: { periodo_inicio: string; periodo_fin: string } | { periodo_inicio: string; periodo_fin: string }[];
  };
  const porEmp = new Map<string, { salario: number; horas: number; horasEstimadas: number; corridas: number }>();
  for (const l of (lineas ?? []) as unknown as L[]) {
    const run = Array.isArray(l.payroll_runs) ? l.payroll_runs[0] : l.payroll_runs;
    const x = porEmp.get(l.employee_id) ?? { salario: 0, horas: 0, horasEstimadas: 0, corridas: 0 };
    // El bono no cuenta sobre otros bonos.
    x.salario += n(l.bruto) - n(l.detalle?.desglose?.bonos);
    const h = n(l.entrada?.horasRegulares) + n(l.entrada?.horasExtra);
    if (h > 0) x.horas += h;
    else if (run) {
      // Salariado sin horas capturadas: se estima 40 h por semana cubierta.
      const dias = (Date.parse(run.periodo_fin) - Date.parse(run.periodo_inicio)) / 86_400_000 + 1;
      x.horasEstimadas += (dias / 7) * 40;
    }
    x.corridas += 1;
    porEmp.set(l.employee_id, x);
  }

  const filas = (empleados ?? []).map((e) => {
    const x = porEmp.get(e.id as string) ?? { salario: 0, horas: 0, horasEstimadas: 0, corridas: 0 };
    const horas = r2(x.horas + x.horasEstimadas);
    const elegible = x.corridas > 0 && horas >= n(usado.horasMin);
    const monto = elegible ? r2(Math.min(x.salario * n(usado.pct), n(usado.tope))) : 0;
    return {
      employeeId: e.id as string,
      nombre: e.nombre as string,
      salario: r2(x.salario),
      horas,
      horasEstimadas: x.horasEstimadas > 0,
      corridas: x.corridas,
      elegible,
      monto,
    };
  });

  return NextResponse.json({ ok: true, anio, periodo: { desde: inicioISO, hasta: finISO }, fechaPago, config: usado, filas });
}
