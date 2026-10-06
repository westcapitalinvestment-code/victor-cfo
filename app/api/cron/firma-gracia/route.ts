import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Cron diario (6 oct 2026): cuando vence la gracia de un cliente liberado por
// su firma y no contrató su propio plan, baja a 'gratis'. Contratar el plan
// limpia firma_gracia_hasta (checkout.session.completed en el webhook), así
// que cualquier fila que llegue aquí con la gracia vencida NO pagó. No se
// borra ningún dato — solo cambia el plan.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: vencidos, error } = await supabase
    .from("users")
    .select("id")
    .not("firma_gracia_hasta", "is", null)
    .lt("firma_gracia_hasta", new Date().toISOString())
    .is("billed_by_firma_id", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let degradados = 0;
  for (const u of vencidos ?? []) {
    const { error: e } = await supabase
      .from("users")
      .update({ plan: "gratis", plan_status: "active", firma_gracia_hasta: null, firma_liberado_de_id: null })
      .eq("id", u.id);
    if (!e) degradados++;
  }

  console.log("[firma-gracia]", JSON.stringify({ revisados: vencidos?.length ?? 0, degradados }));
  return NextResponse.json({ ok: true, revisados: vencidos?.length ?? 0, degradados });
}
