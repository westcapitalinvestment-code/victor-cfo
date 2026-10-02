import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendCpaEquipoInvitationEmail } from "@/lib/email";

// Un CPA líder (ej. Héctor) invita a un colega de su propio equipo (ej.
// Josué) desde su portal — 2 oct 2026, decisión de Joel ("Opción B"): el
// dueño del negocio no participa en esta invitación, solo necesita poder
// ver después quién entró y poder quitarle el acceso a cualquiera (eso
// vive en /dashboard/invitar-contable, no aquí).
//
// Requiere que quien invita YA tenga al menos una fila activa en
// account_members con role='cpa' — si no, no es un CPA real en el
// sistema y no tiene nada que compartir con un colega.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { count: clientesActivos } = await supabase
    .from("account_members")
    .select("id", { count: "exact", head: true })
    .eq("member_email", user.email)
    .eq("role", "cpa")
    .eq("active", true);

  if (!clientesActivos) {
    return NextResponse.json(
      { error: "Todavía no tienes clientes conectados en VICTOR — necesitas al menos uno para poder compartir acceso con tu equipo." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const staffEmail: string | undefined = body?.staffEmail;
  const staffName: string | null = body?.staffName || null;

  if (!staffEmail || typeof staffEmail !== "string" || !staffEmail.includes("@")) {
    return NextResponse.json({ error: "Falta un correo válido para tu colega." }, { status: 400 });
  }

  if (staffEmail.toLowerCase() === user.email.toLowerCase()) {
    return NextResponse.json({ error: "No te puedes invitar a ti mismo." }, { status: 400 });
  }

  const { data: invitation, error: insertError } = await supabase
    .from("cpa_team_invitations")
    .insert({
      lead_email: user.email,
      staff_name: staffName,
      staff_email: staffEmail,
    })
    .select("id, invitation_token")
    .single();

  if (insertError || !invitation) {
    return NextResponse.json({ error: insertError?.message || "No se pudo guardar la invitación." }, { status: 500 });
  }

  const { data: perfil } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();

  const emailResult = await sendCpaEquipoInvitationEmail({
    staffEmail,
    staffName,
    leadName: perfil?.full_name ?? null,
    leadEmail: user.email,
    invitationToken: invitation.invitation_token,
  });

  return NextResponse.json({ invitationId: invitation.id, emailSent: emailResult.sent, emailReason: emailResult.reason });
}

// Lista las invitaciones de equipo que ESTE CPA ha mandado — RLS
// (cpa_team_invitations_lead_all) ya filtra solo las suyas.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("cpa_team_invitations")
    .select("id, staff_name, staff_email, status, invited_at, accepted_at")
    .order("invited_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ invitaciones: data ?? [] });
}
