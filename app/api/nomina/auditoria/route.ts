import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNomina } from "@/lib/nomina-server";

// Bitácora de la nómina de una entidad (quién hizo qué): últimas 200 acciones.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;
  // Filtro por fechas (YYYY-MM-DD, hora de Puerto Rico = UTC-4, sin horario de verano).
  const f = /^\d{4}-\d{2}-\d{2}$/;
  const desde = req.nextUrl.searchParams.get("desde") ?? "";
  const hasta = req.nextUrl.searchParams.get("hasta") ?? "";
  let q = g.db
    .from("payroll_audit_log")
    .select("id, actor_email, actor_rol, accion, detalle, created_at")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId);
  if (f.test(desde)) q = q.gte("created_at", `${desde}T00:00:00-04:00`);
  if (f.test(hasta)) q = q.lte("created_at", `${hasta}T23:59:59.999-04:00`);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(f.test(desde) || f.test(hasta) ? 500 : 200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, filas: data ?? [] });
}
