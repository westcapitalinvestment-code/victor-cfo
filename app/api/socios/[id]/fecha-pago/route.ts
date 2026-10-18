import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";

// El founder programa la fecha del próximo pago a un vendedor (migración
// 0165). null borra la fecha.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const fecha = body?.fecha;
  if (fecha !== null && !(typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha))) {
    return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin.from("socios").update({ proxima_fecha_pago: fecha }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "No se pudo guardar la fecha." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
