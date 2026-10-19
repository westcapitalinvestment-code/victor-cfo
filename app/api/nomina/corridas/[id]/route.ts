import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exigirNomina } from "@/lib/nomina-server";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const g = await exigirNomina(supabase);
  if ("error" in g) return g.error;
  const { data: run } = await supabase.from("payroll_runs").select("*").eq("id", params.id).eq("owner_id", g.userId).maybeSingle();
  if (!run) return NextResponse.json({ error: "Corrida no encontrada." }, { status: 404 });
  const { data: lineas } = await supabase.from("payroll_run_lines").select("*").eq("run_id", params.id).order("created_at");
  return NextResponse.json({ ok: true, corrida: run, lineas: lineas ?? [] });
}

// Borrar una corrida devuelve los acumulados del año al estado anterior.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const g = await exigirNomina(supabase);
  if ("error" in g) return g.error;
  const { error } = await supabase.from("payroll_runs").delete().eq("id", params.id).eq("owner_id", g.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
