import { Resend } from "resend";
import { createHmac, timingSafeEqual } from "crypto";

// Correos de mercadeo en frío (B2B, a negocios que publican su email para
// consultas). SEPARADO a propósito de lib/email.ts: sale de un subdominio
// aparte (MKT_FROM_EMAIL, ej. "Joel de VICTOR CFO <contacto@mercadeo.victorcfo.com>")
// para que, si hay quejas, no dañe la reputación del dominio principal que
// usan las facturas y el soporte. Si MKT_FROM_EMAIL no está puesta, NO envía
// (nunca cae al remitente principal).
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const SITE_URL = "https://www.victorcfo.com";

function firmar(id: string): string {
  return createHmac("sha256", process.env.CRON_SECRET || "").update(`mkt:${id}`).digest("hex").slice(0, 32);
}
export function urlBajaMkt(id: string): string {
  return `${SITE_URL}/api/mkt/baja?p=${encodeURIComponent(id)}&t=${firmar(id)}`;
}
export function tokenBajaMktValido(id: string, token: string): boolean {
  if (!process.env.CRON_SECRET) return false;
  const a = Buffer.from(firmar(id));
  const b = Buffer.from(token || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function llenarPlantilla(texto: string, v: { nombre?: string | null; empresa?: string | null; nota?: string | null }): string {
  const nombre = (v.nombre || "").trim();
  return texto
    .replace(/\{\{\s*nombre\s*\}\}/gi, nombre || "")
    .replace(/\{\{\s*empresa\s*\}\}/gi, (v.empresa || "").trim() || "tu negocio")
    .replace(/\{\{\s*nota\s*\}\}/gi, (v.nota || "").trim())
    .replace(/Hola ,/g, "Hola,");
}

export async function enviarCorreoMercadeo(p: {
  to: string;
  prospectoId: string;
  asunto: string;
  cuerpo: string;
  direccionFisica: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada." };
  const from = process.env.MKT_FROM_EMAIL;
  if (!from) return { sent: false, reason: "Falta MKT_FROM_EMAIL (remitente del subdominio de mercadeo)." };
  if (!p.direccionFisica.trim()) return { sent: false, reason: "Falta la dirección física (obligatoria por ley en correos comerciales)." };

  const baja = urlBajaMkt(p.prospectoId);
  const pie =
    `Recibes este mensaje porque tu negocio publica este correo para consultas. ` +
    `Es un mensaje comercial de VICTOR CFO, un producto de West Capital Ventures LLC. ${p.direccionFisica.trim()}. ` +
    `Si no quieres recibir más correos nuestros, date de baja aquí: ${baja}`;

  const html = `
<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#1a1a1a;line-height:1.55;font-size:15px">
  ${p.cuerpo.split("\n").map((l) => (l.trim() ? `<p style="margin:0 0 12px">${esc(l)}</p>` : "")).join("")}
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 12px" />
  <p style="font-size:11px;color:#888;margin:0">Recibes este mensaje porque tu negocio publica este correo para consultas. Es un mensaje comercial de VICTOR CFO, un producto de West Capital Ventures LLC.<br/>${esc(p.direccionFisica.trim())}<br/><a href="${baja}" style="color:#888">Darme de baja</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from,
      to: p.to,
      replyTo: process.env.MKT_REPLY_TO || undefined,
      subject: p.asunto,
      text: `${p.cuerpo}\n\n--\n${pie}`,
      html,
      headers: {
        "List-Unsubscribe": `<${baja}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Error enviando." };
  }
}
