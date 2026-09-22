import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendRecordatorioOnboardingEmail } from "@/lib/email";

// Cron diario (22 sept 2026) — caso real: Luis Vélez pagó Core el 20 sept,
// pero cerró el chat de onboarding de VICTOR antes de contestarle las
// preguntas de perfil (apodo/edad/situación — migración 0008), así que
// user_profiles.perfil_completo se quedó en false. El chat de onboarding SÍ
// se le vuelve a abrir solo cada vez que visita el dashboard (ver
// app/dashboard/layout.tsx, autoOpenOnboarding), pero si la persona
// simplemente no volvió a abrir la app, no había ningún empujón EXTERNO
// (push o correo) que la trajera de vuelta — el saludo proactivo diario
// (migración 0014) tampoco aplica porque requiere perfil_completo=true.
//
// Este cron manda un correo (una sola vez por usuario, ver
// recordatorio_onboarding_enviado, migración 0093) a cuentas activas/en
// trial cuyo perfil sigue incompleto 24+ horas después de registrarse — le
// da tiempo de sobra a alguien que apenas está probando la app sin
// molestarlo el mismo día.
//
// Mismo patrón de seguridad que el resto de los crons: header Authorization
// con CRON_SECRET, cliente admin porque recorre TODOS los usuarios sin
// sesión de por medio.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();

  const hace24Horas = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Cuentas activas/en trial, creadas hace 24h o más, con perfil todavía
  // incompleto y sin recordatorio previo. plan_status filtra afuera cuentas
  // canceladas o que nunca llegaron a activarse (esas ya reciben
  // sendCasiTerminasEmail por otro flujo, no este).
  const { data: candidatos, error } = await supabase
    .from("users")
    .select("id, email, full_name, created_at, plan_status, user_profiles!inner(perfil_completo, recordatorio_onboarding_enviado)")
    .in("plan_status", ["active", "trialing"])
    .lte("created_at", hace24Horas)
    .eq("user_profiles.perfil_completo", false)
    .eq("user_profiles.recordatorio_onboarding_enviado", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidatos || candidatos.length === 0) {
    return NextResponse.json({ ok: true, usuariosNotificados: 0 });
  }

  let usuariosNotificados = 0;
  const resultados: Record<string, unknown> = {};

  for (const usuario of candidatos) {
    try {
      if (!usuario.email) {
        resultados[usuario.id] = { enviado: false, razon: "sin email" };
        continue;
      }

      const resultado = await sendRecordatorioOnboardingEmail({
        toEmail: usuario.email,
        toName: usuario.full_name,
      });

      // Se marca como enviado incluso si Resend no está configurada en este
      // ambiente (sent:false por falta de RESEND_API_KEY) — evita reintentar
      // sin parar en producción real el mismo usuario cada día por un motivo
      // que no se va a resolver solo. Si falla por un error puntual de red,
      // sí puede quedar para reintentar mañana (no se marca en ese caso).
      if (resultado.sent || resultado.reason === "RESEND_API_KEY no está configurada en el servidor.") {
        await supabase.from("user_profiles").update({ recordatorio_onboarding_enviado: true }).eq("id", usuario.id);
      }

      if (resultado.sent) usuariosNotificados++;
      resultados[usuario.id] = { enviado: resultado.sent, razon: resultado.reason };
    } catch (err) {
      resultados[usuario.id] = { enviado: false, error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }

  console.log(
    "[recordatorio-onboarding]",
    JSON.stringify({ usuariosNotificados, totalCandidatos: candidatos.length, resultados })
  );

  return NextResponse.json({ ok: true, usuariosNotificados, resultados });
}
