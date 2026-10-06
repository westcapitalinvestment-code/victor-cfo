import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarSeatsFirma } from "@/lib/firma-seats";

// La firma cancela una invitación todavía pendiente: el seat deja de
// contarse y de cobrarse. Si el cliente ya aceptó, se usa "liberar".
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const invitacionId: string | undefined = body?.invitacionId;
  if (!invitacionId) return NextResponse.json({ error: "Falta la invitación." }, { status: 400 });

  const admin = createAdminClient();

  const { data: actualizadas, error } = await admin
    .from("firma_invitaciones")
    .update({ status: "cancelled" })
    .eq("id", invitacionId)
    .eq("firma_id", user.id)
    .eq("status", "pending")
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!actualizadas || actualizadas.length === 0) {
    return NextResponse.json({ error: "Esa invitación ya no está pendiente." }, { status: 404 });
  }

  const r = await sincronizarSeatsFirma(admin, user.id);
  return NextResponse.json({ ok: true, seats: r.seats, suscripcionCancelada: r.cancelada });
}
