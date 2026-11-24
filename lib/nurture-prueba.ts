import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { urlBajaCorreos } from "./email-baja";

// Correos de la prueba gratis de 7 días sin tarjeta (24 nov 2026, pedido de
// Joel: "no soy de trabajar mucho, quisiera todo en automático"). Los manda el
// cron diario /api/cron/nurture-emails. Solo a quien está en prueba
// (users.prueba_hasta en el futuro) y no es de Trading (esos tienen su serie).
//   d1 — conecta tu banco / pregúntale qué te cobran cada mes
//   d3 — ¿cuándo sales de tus tarjetas?
//   d5 — te quedan 2 días: VICTOR te recomienda plan en el chat y lo activas con un clic
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL || "VICTOR CFO <onboarding@resend.dev>";
const SITE_URL = "https://www.victorcfo.com";
const DIA = 86_400_000;

type Usuario = { id: string; email: string | null; full_name: string | null; plan: string | null; prueba_hasta: string | null };
type Correo = { asunto: string; titulo: string; parrafos: string[]; cta: string; path: string };

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function correoD1(conBanco: boolean): Correo {
  return conBanco
    ? {
        asunto: "Pregúntale esto a VICTOR hoy",
        titulo: "¿Qué te cobran cada mes?",
        parrafos: [
          "Escríbele a VICTOR: \"¿Qué cobros se repiten cada mes en mis cuentas?\"",
          "Te enseña cada uno con su monto. Fíjate en los que ya no usas o creías cancelados: a un dueño de negocio le apareció uno de $38 al mes ($456 al año).",
        ],
        cta: "Preguntarle a VICTOR",
        path: "/dashboard",
      }
    : {
        asunto: "Lo que todavía no has visto",
        titulo: "Conecta tu cuenta y mira qué te cobran",
        parrafos: [
          "Con tu banco o tarjeta conectados, VICTOR revisa tus movimientos y te enseña los cobros que se repiten cada mes, incluso los que ya olvidaste.",
          "Toma 2 minutos y es de solo lectura: VICTOR ve tus movimientos, no puede mover tu dinero.",
        ],
        cta: "Conectar mi cuenta",
        path: "/dashboard",
      };
}

const D3: Correo = {
  asunto: "¿Ya sabes en qué fecha sales de tus tarjetas?",
  titulo: "Tu fecha de salida",
  parrafos: [
    "Pregúntale a VICTOR: \"¿Cuándo salgo de mis tarjetas y cuál es el camino más corto?\"",
    "Te lo calcula con tus balances e intereses reales, mes por mes. La mayoría sale años antes de lo que pensaba.",
  ],
  cta: "Ver mi camino",
  path: "/dashboard",
};

function correoD5(dias: number): Correo {
  return {
    asunto: dias <= 1 ? "Tu prueba termina mañana" : `Te quedan ${dias} días de prueba`,
    titulo: "¿Seguimos?",
    parrafos: [
      "Tu prueba gratis está por terminar. ¿Qué plan te conviene? Pregúntale a VICTOR en el chat: ya conoce tus números (personales y de negocio) y te dice cuál, con el enlace para activarlo en un clic.",
      "Core es para tus finanzas personales; Pro suma tu negocio; Business, si tienes empleados o varias cuentas de negocio.",
      "Si no activas ninguno, tu prueba se cancela sola. Sin cargos.",
    ],
    cta: "Preguntarle a VICTOR",
    path: "/dashboard",
  };
}

async function enviar(u: Usuario, c: Correo): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "sin-resend" };
  if (!u.email) return { sent: false, reason: "sin-email" };
  const hola = u.full_name ? `Hola ${esc(u.full_name.split(" ")[0])},` : "Hola,";
  const url = `${SITE_URL}${c.path}`;
  const baja = urlBajaCorreos(SITE_URL, u.id);
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1B3A5C;line-height:1.5">
<p>${hola}</p>
<h2 style="margin:0 0 12px">${esc(c.titulo)}</h2>
${c.parrafos.map((p) => `<p>${esc(p)}</p>`).join("")}
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#1B3A5C;color:#fff;padding:12px 22px;border-radius:999px;font-weight:bold;text-decoration:none">${esc(c.cta)}</a></p>
<p style="font-size:12px;color:#888">VICTOR CFO · West Capital Ventures LLC · <a href="${baja}" style="color:#888">No quiero más correos</a></p>
</div>`;
  const text = `${hola.replace(/&[a-z]+;/g, "")}\n\n${c.titulo}\n\n${c.parrafos.join("\n\n")}\n\n${c.cta}: ${url}\n\nNo quiero más correos: ${baja}`;
  const r = await resend.emails.send({ from: FROM, to: u.email, subject: c.asunto, html, text });
  return r.error ? { sent: false, reason: r.error.message } : { sent: true };
}

export async function procesarNurturePrueba(supabase: SupabaseClient): Promise<{ enviados: number; resultados: Record<string, unknown> }> {
  const ahora = Date.now();
  const resultados: Record<string, unknown> = {};
  let enviados = 0;

  const { data: enPrueba, error } = await supabase
    .from("users")
    .select("id, email, full_name, plan, prueba_hasta, created_at, trading_incluido, prueba_d1_at, prueba_d3_at, prueba_d5_at")
    .gt("prueba_hasta", new Date(ahora).toISOString())
    .is("email_marketing_baja_at", null);
  if (error) return { enviados, resultados: { error: error.message } };

  for (const u of enPrueba ?? []) {
    if (u.trading_incluido) continue;
    const inicio = new Date(u.prueba_hasta as string).getTime() - 7 * DIA;
    const diasDentro = (ahora - Math.max(inicio, new Date(u.created_at as string).getTime())) / DIA;
    const diasQuedan = Math.ceil((new Date(u.prueba_hasta as string).getTime() - ahora) / DIA);

    let col: string | null = null;
    let correo: Correo | null = null;
    if (!u.prueba_d5_at && diasQuedan <= 2) {
      col = "prueba_d5_at";
      correo = correoD5(diasQuedan);
    } else if (!u.prueba_d1_at && diasDentro >= 1) {
      const { count } = await supabase.from("plaid_accounts").select("id", { count: "exact", head: true }).eq("owner_id", u.id);
      col = "prueba_d1_at";
      correo = correoD1((count ?? 0) > 0);
    } else if (u.prueba_d1_at && !u.prueba_d3_at && diasDentro >= 3) {
      col = "prueba_d3_at";
      correo = D3;
    }
    if (!col || !correo) continue;
    try {
      const r = await enviar(u as Usuario, correo);
      if (r.sent || r.reason === "sin-resend" || r.reason === "sin-email") {
        // Al mandar el d5, los anteriores que no salieron ya no tienen sentido.
        const marca = new Date().toISOString();
        const upd: Record<string, string> = { [col]: marca };
        if (col === "prueba_d5_at") {
          if (!u.prueba_d3_at) upd.prueba_d3_at = marca;
          if (!u.prueba_d1_at) upd.prueba_d1_at = marca;
        }
        await supabase.from("users").update(upd).eq("id", u.id);
      }
      if (r.sent) enviados++;
      resultados[`prueba-${col}:${u.id}`] = { enviado: r.sent, razon: r.reason };
    } catch (err) {
      resultados[`prueba-${col}:${u.id}`] = { enviado: false, error: err instanceof Error ? err.message : "Error" };
    }
  }
  return { enviados, resultados };
}
