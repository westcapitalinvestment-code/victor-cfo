import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSesionTecnico, COOKIE_SESION_TECNICO } from "@/lib/tecnico-session";

// Re-hidrata la sesión del técnico cuando recarga /tecnico con la cookie ya
// puesta (para no pedirle el PIN de nuevo cada vez que abre el link).
export async function GET(req: NextRequest) {
  const technicianId = verificarSesionTecnico(req.cookies.get(COOKIE_SESION_TECNICO)?.value);
  if (!technicianId) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const { data: tecnico } = await admin
    .from("technicians")
    .select("id, name, entity_id, active, approval_mode, max_discount_pct")
    .eq("id", technicianId)
    .maybeSingle();

  if (!tecnico || !tecnico.active) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: catalogo } = await admin
    .from("technician_service_catalog")
    .select("id, nombre, descripcion, precio")
    .eq("entity_id", tecnico.entity_id)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  return NextResponse.json({
    ok: true,
    tecnico: { id: tecnico.id, name: tecnico.name },
    catalogo: catalogo ?? [],
    approvalMode: tecnico.approval_mode,
    maxDescuentoPct: Number(tecnico.max_discount_pct ?? 0),
  });
}
