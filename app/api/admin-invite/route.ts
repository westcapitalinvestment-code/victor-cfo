import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendAdminInvitationEmail } from "@/lib/email";

// Guarda la invitación al admin/secretaria (tabla admin_invitations) y, si
// hay RESEND_API_KEY configurada, le manda el correo de una vez. Mismo
// patrón que /api/cpa-invite, pero SIEMPRE con una entidad específica (el
// admin trabaja dentro de UN negocio, ver migración 0054) y guardando de
// una vez los permisos elegidos en el modal "Añadir admin/secretaria" —
// se copian a account_members.permissions cuando acepte.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const entityId: string | undefined = body?.entityId;
  const adminEmail: string | undefined = body?.adminEmail;
  const adminName: string | null = body?.adminName || null;
  const vendorId: string | null = body?.vendorId || null;
  const permisos = body?.permissions && typeof body.permissions === "object" ? body.permissions : {};

  if (!entityId) {
    return NextResponse.json({ error: "Falta la entidad de negocio." }, { status: 400 });
  }
  if (!adminEmail || typeof adminEmail !== "string" || !adminEmail.includes("@")) {
    return NextResponse.json({ error: "Falta un correo válido." }, { status: 400 });
  }

  // Confirma que la entidad sea del dueño que está invitando — nunca
  // confiar en el entityId que manda el cliente sin verificar.
  const { data: entidad } = await supabase
    .from("business_entities")
    .select("id, name")
    .eq("id", entityId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!entidad) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }

  const { data: invitation, error: insertError } = await supabase
    .from("admin_invitations")
    .insert({
      owner_id: user.id,
      entity_id: entityId,
      admin_name: adminName,
      admin_email: adminEmail,
      permissions: permisos,
      vendor_id: vendorId,
    })
    .select("id, invitation_token")
    .single();

  if (insertError || !invitation) {
    return NextResponse.json({ error: insertError?.message || "No se pudo guardar la invitación." }, { status: 500 });
  }

  const { data: profile } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();

  const emailResult = await sendAdminInvitationEmail({
    adminEmail,
    adminName,
    ownerName: profile?.full_name ?? null,
    entityName: entidad.name,
    invitationToken: invitation.invitation_token,
  });

  return NextResponse.json({ invitationId: invitation.id, emailSent: emailResult.sent, emailReason: emailResult.reason });
}
