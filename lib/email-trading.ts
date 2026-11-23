import { Resend } from "resend";
import { urlBajaCorreos } from "./email-baja";

// Serie de correos para traders de Core + Trading (19 nov 2026, pedido de Joel).
// Mismo estilo que los nurture de lib/email.ts; aparte para no crecer ese archivo.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.RESEND_FROM_EMAIL || "VICTOR CFO <onboarding@resend.dev>";
const SITE_URL = "https://www.victorcfo.com";

export type CorreoTrading = "d1" | "d3" | "d14" | "negocio" | "prueba";

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CORREOS: Record<CorreoTrading, { asunto: string; titulo: string; parrafos: string[]; cta: string; path: string }> = {
  d1: {
    asunto: "Instala tu guardián en 5 minutos",
    titulo: "Tu guardián de trading está listo",
    parrafos: [
      "En Trading → Riesgo pon cuánto puedes perder al día y cuántas pérdidas aguantas. Ej. $21 y 3 = $7 por trade, en cualquier activo.",
      "Pulsa \"Descargar guardián para MT5\" (ya viene listo, sin compilar), cópialo en MQL5 → Experts y ponlo en un solo gráfico con Algo Trading activado; en Entradas pega tu código de conexión. La guía paso a paso está en la misma pantalla.",
      "Desde ese momento calcula tu lote, pone tu stop y te bloquea cuando llegas a tu límite. Pruébalo primero en tu cuenta demo.",
    ],
    cta: "Configurar mis reglas",
    path: "/dashboard/trading",
  },
  d3: {
    asunto: "Cómo leer tu panel de trading",
    titulo: "Tus números, sin Excel",
    parrafos: [
      "Verde en la línea del lote = el trade cabe en tu riesgo. Rojo = ni el lote mínimo cabe: ese activo se mueve demasiado para tu cuenta ahora mismo.",
      "En el Panel de VICTOR ves tu % de hoy, del mes y del año, tus límites del día como en una cuenta de fondeo y un calendario de días verdes y rojos.",
      "La bitácora marca cada trade que rompió una regla. La meta no es ganar todos: es que ningún día malo te queme la cuenta.",
    ],
    cta: "Ver mi panel",
    path: "/dashboard/trading",
  },
  d14: {
    asunto: "¿Tu trading ya es un negocio?",
    titulo: "Cuando el trading deja de ser un pasatiempo",
    parrafos: [
      "Si operas con constancia y tus resultados empiezan a sumar, conviene llevarlo como un negocio: separar el dinero, registrar gastos (plataformas, datos, equipo) y planificar impuestos.",
      "VICTOR Pro y Business organizan eso por ti: estado de resultados, gastos deducibles y reportes para tu contable. El trading sigue incluido y al subir pagas solo la diferencia.",
      "Si tus ganancias crecen, habla con un contable sobre si te conviene una estructura como una LLC. VICTOR te prepara los números para esa conversación.",
    ],
    cta: "Ver planes",
    path: "/dashboard/config#plan",
  },
  // 22 nov 2026: fin del periodo de prueba del plan de reglas
  prueba: {
    asunto: "Terminó tu prueba: revisemos tus resultados",
    titulo: "Tus reglas ya tienen datos",
    parrafos: [
      "Terminó el periodo de prueba de tu plan de trading. Operaste con las mismas reglas todo este tiempo y eso hace que tus resultados se puedan medir de verdad.",
      "Entra a Trading y toca \"Revisar con VICTOR\". Te muestra qué activos, horarios y días te funcionan, dónde rompiste el plan y cuánto te costó, y te propone ajustes. Tú decides cuáles aplicar.",
      "Cada ajuste empieza una nueva prueba. Así tu trading se vuelve un sistema documentado, no una corazonada.",
    ],
    cta: "Revisar mis resultados",
    path: "/dashboard/trading",
  },
  negocio: {
    asunto: "Tus números de trading van bien. Hablemos de impuestos",
    titulo: "Lo que hacen los traders que ganan con sus impuestos",
    parrafos: [
      "Tus últimos meses de trading van en positivo. Ese es el momento de ordenar la parte fiscal, no en abril.",
      "Guarda el reporte de tu broker, separa una parte de las ganancias para impuestos y lleva tus gastos de trading aparte. Con VICTOR Pro o Business eso queda listo para tu contable.",
      "Si el trading ya es una fuente de ingreso real, pregúntale a tu contable si te conviene operar desde una LLC. VICTOR no da asesoría legal ni fiscal, pero te tiene los números listos.",
    ],
    cta: "Organizarlo con VICTOR",
    path: "/dashboard/config#plan",
  },
};

export async function sendCorreoTrading(params: { tipo: CorreoTrading; toEmail: string; toName: string | null; userId: string }): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  const c = CORREOS[params.tipo];
  const ctaUrl = `${SITE_URL}${c.path}`;
  const bajaUrl = urlBajaCorreos(SITE_URL, params.userId);
  const texto =
    (params.toName ? `Hola ${params.toName},\n\n` : "Hola,\n\n") +
    `${c.titulo}\n\n${c.parrafos.join("\n\n")}\n\n${c.cta}: ${ctaUrl}\n\n— VICTOR CFO\n${SITE_URL}\n\nDejar de recibir estos correos: ${bajaUrl}`;
  const html = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${params.toName ? `Hola, <strong>${esc(params.toName)}</strong>,` : "Hola,"}</p>
  <h2 style="font-size: 20px; margin: 16px 0 12px 0;">${esc(c.titulo)}</h2>
  ${c.parrafos.map((p) => `<p style="color: #333;">${esc(p)}</p>`).join("\n  ")}
  <div style="text-align: center; margin: 28px 0;">
    <a href="${ctaUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">${esc(c.cta)}</a>
  </div>
  <p style="font-size: 12px; color: #777;">VICTOR no da señales ni asesoría financiera, legal o fiscal. El trading conlleva riesgo.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a><br/><a href="${bajaUrl}" style="color: #999;">Dejar de recibir estos correos</a></p>
</div>`.trim();
  try {
    const { error } = await resend.emails.send({ from: FROM, to: params.toEmail, subject: c.asunto, text: texto, html });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}
