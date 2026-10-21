import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNomina } from "@/lib/nomina-server";

// Bitácora de la nómina de una entidad (quién hizo qué): últimas 30 acciones.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  const a = await actorNomina(supabase, entityId);
  if ("error" in a) return a.error;
  const { g } = a;
  const { data, error } = await g.db
    .from("payroll_audit_log")
    .select("id, actor_email, actor_rol, accion, created_at")
    .eq("owner_id", g.userId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, filas: data ?? [] });
}
