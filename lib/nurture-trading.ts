import type { SupabaseClient } from "@supabase/supabase-js";
import { sendCorreoTrading, type CorreoTrading } from "./email-trading";

// Serie para traders de Core + Trading (19 nov 2026), la llama el cron diario
// /api/cron/nurture-emails. Una columna de idempotencia por correo (migración
// 0218). Ventanas de "al menos N días y menos de N+3" igual que los demás.
//   d1  — instalar el guardián
//   d3  — leer el panel
//   d14 — ¿tu trading ya es un negocio? (sube a Pro/Business)
//   negocio — cuando los últimos 90 días van en positivo (≥ $1,000 netos)
const PASOS: { tipo: Exclude<CorreoTrading, "negocio">; col: string; desde: number }[] = [
  { tipo: "d1", col: "nurture_trading_d1_at", desde: 1 },
  { tipo: "d3", col: "nurture_trading_d3_at", desde: 3 },
  { tipo: "d14", col: "nurture_trading_d14_at", desde: 14 },
];
const GANANCIA_NEGOCIO_USD = 1000;
const SIN_RESEND = "RESEND_API_KEY no está configurada en el servidor.";

export async function procesarNurtureTrading(supabase: SupabaseClient): Promise<{ enviados: number; resultados: Record<string, unknown> }> {
  const ahora = Date.now();
  const dia = 24 * 60 * 60 * 1000;
  const resultados: Record<string, unknown> = {};
  let enviados = 0;

  async function enviar(tipo: CorreoTrading, col: string, u: { id: string; email: string | null; full_name: string | null }) {
    if (!u.email) return;
    const r = await sendCorreoTrading({ tipo, toEmail: u.email, toName: u.full_name, userId: u.id });
    if (r.sent || r.reason === SIN_RESEND) await supabase.from("users").update({ [col]: new Date().toISOString() }).eq("id", u.id);
    if (r.sent) enviados++;
    resultados[`trading-${tipo}:${u.id}`] = { enviado: r.sent, razon: r.reason };
  }

  for (const p of PASOS) {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name")
      .eq("trading_incluido", true)
      .eq("plan_status", "active")
      .is("email_marketing_baja_at", null)
      .is(p.col, null)
      .lte("created_at", new Date(ahora - p.desde * dia).toISOString())
      .gte("created_at", new Date(ahora - (p.desde + 3) * dia).toISOString());
    if (error) {
      resultados[`trading-${p.tipo}`] = { error: error.message };
      continue;
    }
    for (const u of data ?? []) {
      try {
        await enviar(p.tipo, p.col, u);
      } catch (err) {
        resultados[`trading-${p.tipo}:${u.id}`] = { enviado: false, error: err instanceof Error ? err.message : "Error" };
      }
    }
  }

  // "Tu trading va bien": traders en Core + Trading con ≥ $1,000 netos en 90 días.
  const { data: candidatos } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("trading_incluido", true)
    .eq("plan", "core")
    .eq("plan_status", "active")
    .is("email_marketing_baja_at", null)
    .is("nurture_trading_negocio_at", null);
  const desde = new Date(ahora - 90 * dia).toISOString();
  for (const u of candidatos ?? []) {
    try {
      const { data: tr } = await supabase.from("trades").select("ganancia, comision, swap").eq("owner_id", u.id).gte("hora_apertura", desde);
      const neto = (tr ?? []).reduce((s, t) => s + Number(t.ganancia) + Number(t.comision) + Number(t.swap), 0);
      if (neto >= GANANCIA_NEGOCIO_USD) await enviar("negocio", "nurture_trading_negocio_at", u);
    } catch (err) {
      resultados[`trading-negocio:${u.id}`] = { enviado: false, error: err instanceof Error ? err.message : "Error" };
    }
  }

  return { enviados, resultados };
}
