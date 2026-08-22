import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Acepta una invitación de CPA. Requiere que el CPA YA esté autenticado
// (recién creó su contraseña o inició sesión en /cpa/aceptar/[token]) —
// esta ruta solo conecta esa sesión con la invitación pendiente.
//
// Usa el cliente ADMIN (service_role, salta RLS) porque el INSERT en
// account_members solo lo puede hacer el dueño según la política
// account_members_owner_write (ver migración 0003) — el CPA que está
// aceptando la invitación nunca es el dueño, así que un insert normal
// con su sesión fallaría por RLS. Por eso esta ruta hace, a mano, la
// misma validación de identidad que normalmente haría RLS: confirma que
// el email de la sesión coincide con el email al que se mandó la
// invitación antes de tocar la base de datos.
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
    .from("cpa_invitations")
    .select("id, owner_id, entity_id, cpa_email, cpa_name, status")
    .eq("invitation_token", token)
    .maybeSingle();

  if (fetchError || !invitation) {
    return NextResponse.json({ error: "Invitación no encontrada o inválida." }, { status: 404 });
  }

  if (invitation.cpa_email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Esta invitación fue enviada a otro correo. Inicia sesión con el correo al que llegó la invitación." },
      { status: 403 }
    );
  }

  // Idempotente: si el CPA vuelve a hacer click en el mismo link (o esta
  // ruta se llama dos veces por un doble-submit), no duplicamos la fila
  // en account_members — solo confirmamos que ya quedó activa.
  if (invitation.status === "accepted") {
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }

  const { error: memberError } = await admin.from("account_members").insert({
    owner_id: invitation.owner_id,
    entity_id: invitation.entity_id,
    member_email: user.email,
    role: "cpa",
    active: true,
    accepted_at: new Date().toISOString(),
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("cpa_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, alreadyAccepted: false });
}

// Detalles públicos de la invitación (para mostrar "Ana, te invitó Joel
// Valentín" en la página antes de pedir contraseña). Va con el cliente
// ADMIN porque todavía no hay sesión en este punto — el visitante apenas
// clickeó el link del correo.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Falta el token de invitación." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invitation, error } = await admin
    .from("cpa_invitations")
    .select("owner_id, cpa_name, cpa_email, status")
    .eq("invitation_token", token)
    .maybeSingle();

  if (error || !invitation) {
    return NextResponse.json({ error: "Invitación no encontrada o inválida." }, { status: 404 });
  }

  const { data: owner } = await admin.from("users").select("full_name").eq("id", invitation.owner_id).maybeSingle();

  return NextResponse.json({
    ownerName: owner?.full_name ?? null,
    cpaName: invitation.cpa_name,
    cpaEmail: invitation.cpa_email,
    status: invitation.status,
  });
}
