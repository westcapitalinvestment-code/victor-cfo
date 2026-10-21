import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNomina, calcularCorrida, type EntradaCorrida } from "@/lib/nomina-server";

// Vista previa de una corrida: calcula todo en el servidor (nunca confía en
// números que mande el navegador) pero NO guarda nada.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = (await req.json().catch(() => null)) as EntradaCorrida | null;
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const a = await actorNomina(supabase, String(body.entityId ?? ""));
  if ("error" in a) return a.error;
  const { g } = a;
  try {
    const r = await calcularCorrida(g.db, g.userId, body);
    if (!r.resultado) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
    return NextResponse.json({ ok: true, ...r.resultado });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo calcular la nómina." }, { status: 500 });
  }
}
