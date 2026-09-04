import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashCodigoRespaldo } from "@/lib/mfa-backup-codes";
import { sendMfaBackupCodeUsedEmail } from "@/lib/email";

// Usar un código de respaldo cuando se perdió el acceso a la app de
// autenticación (ver app/login/verificar/page.tsx). A propósito NO intenta
// simular una verificación TOTP real — Supabase Auth solo eleva la sesión a
// aal2 con un código TOTP de verdad, así que en vez de eso, un código de
// respaldo válido DESACTIVA el factor MFA de la cuenta por completo (vía
// Admin API, con service_role) y deja pasar con la sesión normal (aal1). Es
// la misma idea que "código de recuperación" en la mayoría de apps: es una
// puerta de emergencia, no un segundo factor silencioso — el usuario tiene
// que volver a activar MFA si lo quiere seguir usando.
export async function POST(req: NextRequest) {
  // El usuario ya tiene sesión (aal1, recién autenticado con contraseña) —
  // se usa el cliente con sesión, no el admin, para saber CON CERTEZA de
  // quién es este código (RLS de mfa_backup_codes limita todo a sus propias
  // filas), y solo se usa el admin client después, para el paso que sí lo
  // necesita (borrar el factor MFA de Supabase).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const codigo = typeof body?.codigo === "string" ? body.codigo : "";
  if (!codigo.trim()) {
    return NextResponse.json({ error: "Escribe un código de respaldo." }, { status: 400 });
  }

  const hash = hashCodigoRespaldo(codigo);
  const { data: fila } = await supabase
    .from("mfa_backup_codes")
    .select("id")
    .eq("user_id", user.id)
    .eq("code_hash", hash)
    .is("used_at", null)
    .maybeSingle();

  if (!fila) {
    return NextResponse.json({ error: "Ese código no es válido, ya se usó, o no coincide con tu cuenta." }, { status: 400 });
  }

  await supabase.from("mfa_backup_codes").update({ used_at: new Date().toISOString() }).eq("id", fila.id);

  // Apagar MFA de verdad: borrar el/los factor(es) TOTP verificados de la
  // cuenta. Necesita service_role — un usuario en aal1 no puede desenrolar
  // su propio factor vía el SDK normal (Supabase lo exige en aal2), que es
  // justo el problema que este endpoint existe para resolver.
  const admin = createAdminClient();
  const { data: factores } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  for (const factor of factores?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id });
  }

  // Limpiar los códigos de respaldo restantes — quedaron huérfanos sin
  // ningún factor MFA que respalden; si el usuario vuelve a activar MFA,
  // /api/mfa/backup-codes/generate le da un set nuevo.
  await supabase.from("mfa_backup_codes").delete().eq("user_id", user.id);

  if (user.email) {
    await sendMfaBackupCodeUsedEmail({ toEmail: user.email }).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
