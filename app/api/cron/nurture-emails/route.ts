import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNurtureFeaturesGratisEmail, sendNurtureTrialOfertaEmail } from "@/lib/email";

// Cron diario (25 sept 2026, pedido de Joel) — secuencia de nurture para
// cuentas plan='gratis', pensada para convertir a Core/Pro usando el email
// que ya capturamos en el registro de 1 clic (ver app/registro/page.tsx):
//   día 2 desde created_at — sendNurtureFeaturesGratisEmail
//   día 5 desde created_at — sendNurtureTrialOfertaEmail
//
// Mismo patrón que /api/cron/recordatorio-onboarding: header Authorization
// con CRON_SECRET, cliente admin, una columna de idempotencia por correo
// (migración 0098) para no reenviar. Solo mira plan='gratis' — quien ya
// paga no necesita que lo convenzan de pagar. Usa ventanas de "al menos N
// días Y menos de N+3 días" en vez de "== N días exactos" para que, si el
// cron no corre un día por lo que sea, el usuario no se quede sin su correo
// para siempre — solo lo recibe un poco tarde.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const ahora = Date.now();
  const diasMs = (n: number) => n * 24 * 60 * 60 * 1000;

  const resultados: Record<string, unknown> = {};
  let enviadosDia2 = 0;
  let enviadosDia5 = 0;

  // --- Día 2: features gratis --------------------------------------------
  const { data: candidatosDia2, error: errorDia2 } = await supabase
    .from("users")
    .select("id, email, full_name, created_at")
    .eq("plan", "gratis")
    .is("nurture_features_gratis_enviado_at", null)
    .lte("created_at", new Date(ahora - diasMs(2)).toISOString())
    .gte("created_at", new Date(ahora - diasMs(5)).toISOString());

  if (errorDia2) return NextResponse.json({ error: errorDia2.message }, { status: 500 });

  for (const usuario of candidatosDia2 || []) {
    try {
      if (!usuario.email) {
        resultados[`dia2:${usuario.id}`] = { enviado: false, razon: "sin email" };
        continue;
      }
      const resultado = await sendNurtureFeaturesGratisEmail({ toEmail: usuario.email, toName: usuario.full_name ?? null });
      if (resultado.sent || resultado.reason === "RESEND_API_KEY no está configurada en el servidor.") {
        await supabase.from("users").update({ nurture_features_gratis_enviado_at: new Date().toISOString() }).eq("id", usuario.id);
      }
      if (resultado.sent) enviadosDia2++;
      resultados[`dia2:${usuario.id}`] = { enviado: resultado.sent, razon: resultado.reason };
    } catch (err) {
      resultados[`dia2:${usuario.id}`] = { enviado: false, error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }

  // --- Día 5: oferta de prueba de 7 días ----------------------------------
  const { data: candidatosDia5, error: errorDia5 } = await supabase
    .from("users")
    .select("id, email, full_name, created_at")
    .eq("plan", "gratis")
    .is("nurture_trial_oferta_enviado_at", null)
    .lte("created_at", new Date(ahora - diasMs(5)).toISOString())
    .gte("created_at", new Date(ahora - diasMs(8)).toISOString());

  if (errorDia5) return NextResponse.json({ error: errorDia5.message, resultados }, { status: 500 });

  for (const usuario of candidatosDia5 || []) {
    try {
      if (!usuario.email) {
        resultados[`dia5:${usuario.id}`] = { enviado: false, razon: "sin email" };
        continue;
      }
      const resultado = await sendNurtureTrialOfertaEmail({ toEmail: usuario.email, toName: usuario.full_name ?? null });
      if (resultado.sent || resultado.reason === "RESEND_API_KEY no está configurada en el servidor.") {
        await supabase.from("users").update({ nurture_trial_oferta_enviado_at: new Date().toISOString() }).eq("id", usuario.id);
      }
      if (resultado.sent) enviadosDia5++;
      resultados[`dia5:${usuario.id}`] = { enviado: resultado.sent, razon: resultado.reason };
    } catch (err) {
      resultados[`dia5:${usuario.id}`] = { enviado: false, error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }

  console.log("[nurture-emails]", JSON.stringify({ enviadosDia2, enviadosDia5, resultados }));

  return NextResponse.json({ ok: true, enviadosDia2, enviadosDia5, resultados });
}
