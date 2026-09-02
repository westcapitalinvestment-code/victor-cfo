import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Acepta una invitación de Admin/Secretaria — mismo patrón que
// /api/cpa-invite/accept (ver ese archivo para la explicación completa de
// por qué se usa el cliente ADMIN con service_role). Diferencia clave: los
// permisos elegidos por el dueño en el modal ("Añadir admin/secretaria")
// viajaban guardados en admin_invitations.permissions — se copian tal cual
// a account_members.permissions al aceptar, para que los toggles ya
// vengan configurados desde el primer login.
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
    .from("admin_invitations")
    .select("id, owner_id, entity_id, admin_email, admin_name, permissions, vendor_id, status")
    .eq("invitation_token", token)
    .maybeSingle();

  if (fetchError || !invitation) {
    return NextResponse.json({ error: "Invitación no encontrada o inválida." }, { status: 404 });
  }

  if (invitation.admin_email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Esta invitación fue enviada a otro correo. Inicia sesión con el correo al que llegó la invitación." },
      { status: 403 }
    );
  }

  if (invitation.status === "accepted") {
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }

  const { error: memberError } = await admin.from("account_members").insert({
    owner_id: invitation.owner_id,
    entity_id: invitation.entity_id,
    member_email: user.email,
    member_name: invitation.admin_name ?? null,
    role: "admin",
    permissions: invitation.permissions ?? {},
    vendor_id: invitation.vendor_id ?? null,
    active: true,
    accepted_at: new Date().toISOString(),
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("admin_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, alreadyAccepted: false });
}

// Detalles públicos de la invitación (para mostrar "Laura, Joel te dio
// acceso a Facturación de VIP Medical" antes de pedir contraseña).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Falta el token de invitación." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invitation, error } = await admin
    .from("admin_invitations")
    .select("owner_id, entity_id, admin_name, admin_email, status")
    .eq("invitation_token", token)
    .maybeSingle();

  if (error || !invitation) {
    return NextResponse.json({ error: "Invitación no encontrada o inválida." }, { status: 404 });
  }

  const [{ data: owner }, { data: entidad }] = await Promise.all([
    admin.from("users").select("full_name").eq("id", invitation.owner_id).maybeSingle(),
    admin.from("business_entities").select("name").eq("id", invitation.entity_id).maybeSingle(),
  ]);

  return NextResponse.json({
    ownerName: owner?.full_name ?? null,
    entityName: entidad?.name ?? null,
    adminName: invitation.admin_name,
    adminEmail: invitation.admin_email,
    status: invitation.status,
  });
}
