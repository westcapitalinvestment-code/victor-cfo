import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Acepta una invitación de equipo (colega de un CPA líder) — mirror exacto
// del patrón de /api/cpa-invite/accept, con un paso extra: en cuanto queda
// aceptada, corre sync_equipo_cpa (migración 0137) para heredar de una vez
// todos los clientes activos que el líder ya tenga hoy.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: "Tienes que iniciar sesión o crear tu contraseña primero." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const token: string | undefined = body?.token;

  if (!token) {
    return NextResponse.json({ error: "Falta el token de invitación." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invitation, error: fetchError } = await admin
    .from("cpa_team_invitations")
    .select("id, lead_email, staff_email, status")
    .eq("invitation_token", token)
    .maybeSingle();

  if (fetchError || !invitation) {
    return NextResponse.json({ error: "Invitación no encontrada o inválida." }, { status: 404 });
  }

  if (invitation.staff_email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Esta invitación fue enviada a otro correo. Inicia sesión con el correo al que llegó la invitación." },
      { status: 403 },
    );
  }

  if (invitation.status === "accepted") {
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }

  const { error: updateError } = await admin
    .from("cpa_team_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Backfill: hereda de una vez todo lo que el líder ya tiene activo hoy.
  // Los clientes que el líder consiga DESPUÉS de este momento se heredan
  // solos vía el trigger propagar_equipo_cpa (migración 0137).
  const { error: syncError } = await admin.rpc("sync_equipo_cpa", {
    p_lead_email: invitation.lead_email,
    p_staff_email: invitation.staff_email,
  });

  if (syncError) {
    return NextResponse.json({ error: syncError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, alreadyAccepted: false });
}

// Detalles públicos de la invitación (para mostrar "Héctor te invitó a su
// equipo" antes de pedir contraseña) — cliente ADMIN porque todavía no hay
// sesión en este punto.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Falta el token de invitación." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invitation, error } = await admin
    .from("cpa_team_invitations")
    .select("lead_email, staff_name, staff_email, status")
    .eq("invitation_token", token)
    .maybeSingle();

  if (error || !invitation) {
    return NextResponse.json({ error: "Invitación no encontrada o inválida." }, { status: 404 });
  }

  const { data: lider } = await admin
    .from("users")
    .select("full_name")
    .eq("email", invitation.lead_email)
    .maybeSingle();

  return NextResponse.json({
    leadName: lider?.full_name ?? null,
    leadEmail: invitation.lead_email,
    staffName: invitation.staff_name,
    staffEmail: invitation.staff_email,
    status: invitation.status,
  });
}
