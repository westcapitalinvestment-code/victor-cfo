import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";

// Marcar una comisión de socio como pagada — solo el founder, después de
// transferir el efectivo por fuera de la app (ATH Business/transferencia,
// ver migración 0070). No hay automatización de payout todavía: este
// endpoint solo deja constancia de que Joel ya pagó, con fecha, para que el
// Dashboard de Operaciones pueda mostrar el estado real y sumar cuánto
// lleva pagado/pendiente cada socio en el año.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: comision } = await admin
    .from("socios_comisiones")
    .select("id, estado")
    .eq("id", params.id)
    .maybeSingle();
  if (!comision) return NextResponse.json({ error: "Comisión no encontrada." }, { status: 404 });
  if (comision.estado === "pagada") return NextResponse.json({ ok: true }); // ya estaba pagada, nada que hacer

  const { error } = await admin
    .from("socios_comisiones")
    .update({ estado: "pagada", fecha_pago: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: "No se pudo marcar como pagada." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
