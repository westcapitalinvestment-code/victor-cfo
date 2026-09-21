import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { sendWelcomeEmail } from "@/lib/email";

// Reenvío manual del correo de bienvenida (21 sept 2026, pedido de Joel: los
// primeros usuarios Core/Pro reales se registraron ANTES de que
// termináramos de personalizar el copy — nombre, escalonado, Citas,
// Metas/Bóveda, cierre con soporte@victorcfo.com — así que su correo
// automático salió con la versión vieja o genérica). Este botón vive en el
// panel de Usuarios del Dashboard de Operaciones y deja mandarlo de nuevo
// con la copy actual, sin tener que tocar Stripe ni re-disparar el webhook.
//
// Solo el founder (mismo candado que /api/socios/*) — la lista de usuarios
// completa (todos los negocios) solo la ve Joel.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Falta userId." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: destinatario, error: fetchError } = await admin
    .from("users")
    .select("email, full_name, plan")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError || !destinatario) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }
  if (!destinatario.email) {
    return NextResponse.json({ error: "Este usuario no tiene correo guardado." }, { status: 400 });
  }
  // El plan "gratis" no tiene copy de bienvenida (solo Core/Pro/Pro+) — ver
  // lib/email.ts sendWelcomeEmail, que solo distingue Core vs. Pro.
  const plan = destinatario.plan === "pro" || destinatario.plan === "proplus" ? destinatario.plan : "core";

  const resultado = await sendWelcomeEmail({
    toEmail: destinatario.email,
    toName: destinatario.full_name ?? null,
    plan,
  });

  if (!resultado.sent) {
    return NextResponse.json({ error: resultado.reason ?? "No se pudo enviar el correo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
