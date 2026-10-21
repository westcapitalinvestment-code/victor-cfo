import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNominaPorFila } from "@/lib/nomina-server";
import { enviarTalonariosCorrida } from "@/lib/nomina-talonarios-server";

// Envía por correo el talonario de cada empleado de una corrida APROBADA (o de uno solo).
// Dueño: siempre. Contable: solo si el dueño le dio aprobación directa (es quien puede
// dar por buena la corrida). Todo queda en Auditoría.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => null);
  const corridaId = String(body?.corridaId ?? "");
  if (!corridaId) return NextResponse.json({ error: "Falta la corrida." }, { status: 400 });
  const a = await actorNominaPorFila(supabase, "payroll_runs", corridaId);
  if ("error" in a) return a.error;
  const { g, entityId } = a;
  if (g.actor === "contable" && !g.apruebaDirecto) {
    return NextResponse.json({ error: "Solo el dueño puede enviar los talonarios a los empleados." }, { status: 403 });
  }
  const r = await enviarTalonariosCorrida(g, entityId, corridaId, { employeeId: body?.employeeId ? String(body.employeeId) : null, origen: "manual" });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, ...r.resultado });
}
