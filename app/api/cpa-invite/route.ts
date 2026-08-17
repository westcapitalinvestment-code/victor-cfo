import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendCpaInvitationEmail } from "@/lib/email";

// Guarda la invitación al contable/CPA (tabla cpa_invitations, gratis para
// cualquier plan) y, si hay RESEND_API_KEY configurada, le manda el correo
// de una vez. Va en su propia ruta (en vez de un insert directo desde el
// cliente) porque enviar el email necesita la llave de Resend, que nunca
// puede vivir en el navegador.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const cpaEmail: string | undefined = body?.cpaEmail;
  const cpaName: string | null = body?.cpaName || null;
  const customMessage: string | null = body?.customMessage || null;

  if (!cpaEmail || typeof cpaEmail !== "string" || !cpaEmail.includes("@")) {
    return NextResponse.json({ error: "Falta un correo válido para el contable." }, { status: 400 });
  }

  const { data: invitation, error: insertError } = await supabase
    .from("cpa_invitations")
    .insert({
      owner_id: user.id,
      entity_id: null,
      cpa_name: cpaName,
      cpa_email: cpaEmail,
      custom_message: customMessage,
    })
    .select("id")
    .single();

  if (insertError || !invitation) {
    return NextResponse.json({ error: insertError?.message || "No se pudo guardar la invitación." }, { status: 500 });
  }

  const { data: profile } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();

  const emailResult = await sendCpaInvitationEmail({
    cpaEmail,
    cpaName,
    ownerName: profile?.full_name ?? null,
    customMessage,
  });

  return NextResponse.json({ invitationId: invitation.id, emailSent: emailResult.sent, emailReason: emailResult.reason });
}
