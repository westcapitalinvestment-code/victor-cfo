import { Resend } from "resend";

// Envío de correo transaccional — hoy solo se usa para la invitación al
// contable/CPA, pero cualquier otro email futuro (recordatorios, recibos)
// puede pasar por aquí. Si RESEND_API_KEY no está configurada, la función
// no revienta la petición — devuelve sent:false y quien la llame decide
// qué decirle al usuario (mismo patrón honesto que Plaid sin conectar).
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// resend.dev es el dominio de pruebas de Resend — funciona sin verificar
// nada, pero solo entrega a la bandeja del dueño de la cuenta de Resend.
// Con victorcfo.com ya verificado (22 agosto 2026), RESEND_FROM_EMAIL debe
// estar puesta en Vercel como "VICTOR CFO <notificaciones@victorcfo.com>" —
// este fallback solo aplica si por lo que sea esa variable no está.
const FROM = process.env.RESEND_FROM_EMAIL || "VICTOR CFO <onboarding@resend.dev>";

// victorcfo.com está hardcodeado (no hay variable de entorno para el
// dominio base) — coincide con el resto del código (landing, términos,
// privacidad) que también lo escriben literal.
const SITE_URL = "https://www.victorcfo.com";

// Escapa lo mínimo indispensable para meter texto del usuario (nombre,
// mensaje personalizado) dentro del HTML del correo sin abrir la puerta a
// que alguien inyecte una etiqueta o rompa el layout.
function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendCpaInvitationEmail(params: {
  cpaEmail: string;
  cpaName: string | null;
  ownerName: string | null;
  customMessage: string | null;
  invitationToken: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { cpaEmail, cpaName, ownerName, customMessage, invitationToken } = params;
  const saludoNombre = cpaName ? cpaName : "";
  const quien = ownerName || "Un cliente";
  const acceptUrl = `${SITE_URL}/cpa/aceptar/${invitationToken}`;

  const textoPlano =
    `Hola${saludoNombre ? ` ${saludoNombre}` : ""},\n\n` +
    `${quien} te invitó a VICTOR CFO, una plataforma de contabilidad financiera con inteligencia ` +
    `artificial que automatiza el ciclo contable — categorización de gastos, reportes fiscales, ` +
    `seguimiento de retenciones e IVU — para dueños de negocio y profesionales independientes en ` +
    `Puerto Rico.\n\n` +
    `Como su contable, vas a tener acceso de SOLO LECTURA a la información que ${quien} decida ` +
    `compartir contigo — sin costo para ti.\n\n` +
    (customMessage ? `Mensaje de ${quien}:\n"${customMessage}"\n\n` : "") +
    `Para activar tu acceso, entra aquí:\n${acceptUrl}\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}\n\n` +
    `Este correo fue enviado porque ${quien} te agregó como su contable en VICTOR CFO. Si no ` +
    `reconoces esta invitación, puedes ignorar este mensaje con confianza — tu información nunca ` +
    `se comparte sin que el usuario acepte explícitamente.`;

  const htmlSeguro = {
    saludo: saludoNombre ? escapeHtml(saludoNombre) : "",
    quien: escapeHtml(quien),
    mensaje: customMessage ? escapeHtml(customMessage) : null,
  };

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9999px; background: #1D9E75; color: #fff; font-weight: 600; font-size: 14px; vertical-align: middle;">V</span>
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>Hola${htmlSeguro.saludo ? ` ${htmlSeguro.saludo}` : ""},</p>
  <p>${htmlSeguro.quien} te invitó a <strong>VICTOR CFO</strong>, una plataforma de contabilidad financiera con inteligencia artificial que automatiza el ciclo contable — categorización de gastos, reportes fiscales, seguimiento de retenciones e IVU — para dueños de negocio y profesionales independientes en Puerto Rico.</p>
  <p>Como su contable, vas a tener acceso de <strong>solo lectura</strong> a la información que ${htmlSeguro.quien} decida compartir contigo — sin costo para ti.</p>
  ${
    htmlSeguro.mensaje
      ? `<div style="background: #f4f4f4; border-left: 3px solid #1D9E75; padding: 12px 16px; margin: 16px 0; font-style: italic; color: #333;">"${htmlSeguro.mensaje}"</div>`
      : ""
  }
  <div style="text-align: center; margin: 28px 0;">
    <a href="${acceptUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Activar mi acceso</a>
  </div>
  <p style="font-size: 12px; color: #666;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/><a href="${acceptUrl}" style="color: #1D9E75; word-break: break-all;">${acceptUrl}</a></p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
  <p style="font-size: 11px; color: #bbb;">Este correo fue enviado porque ${htmlSeguro.quien} te agregó como su contable en VICTOR CFO. Si no reconoces esta invitación, puedes ignorar este mensaje con confianza — tu información nunca se comparte sin que el usuario acepte explícitamente.</p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: cpaEmail,
      subject: `${quien} te invitó a ver sus finanzas en VICTOR CFO`,
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Invitación de Admin/Secretaria (2 sept 2026) — a diferencia del CPA
// (solo lectura de TODO), este acceso es de TRABAJO (crea facturas,
// registra cobros) pero deliberadamente angosto: nunca ve finanzas
// personales ni el total del negocio salvo que el dueño prenda un
// permiso puntual. El correo deja eso clarísimo desde el asunto.
export async function sendAdminInvitationEmail(params: {
  adminEmail: string;
  adminName: string | null;
  ownerName: string | null;
  entityName: string | null;
  invitationToken: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { adminEmail, adminName, ownerName, entityName, invitationToken } = params;
  const saludoNombre = adminName ? adminName : "";
  const quien = ownerName || "Un cliente";
  const negocio = entityName || "su negocio";
  const acceptUrl = `${SITE_URL}/admin/aceptar/${invitationToken}`;

  const textoPlano =
    `Hola${saludoNombre ? ` ${saludoNombre}` : ""},\n\n` +
    `${quien} te dio acceso a VICTOR CFO para ayudar con la facturación de ${negocio} — crear facturas, ` +
    `registrar cobros y ver pendientes, con tu propio correo y contraseña (nunca las de ${quien}).\n\n` +
    `Este acceso solo cubre facturación. Nunca vas a ver finanzas personales de ${quien} ni el total del ` +
    `negocio, a menos que te autorice permisos adicionales puntuales.\n\n` +
    `Para crear tu contraseña y entrar, haz clic aquí:\n${acceptUrl}\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}\n\n` +
    `Este correo fue enviado porque ${quien} te agregó como admin/secretaria en VICTOR CFO. Si no ` +
    `reconoces esta invitación, puedes ignorar este mensaje con confianza.`;

  const htmlSeguro = {
    saludo: saludoNombre ? escapeHtml(saludoNombre) : "",
    quien: escapeHtml(quien),
    negocio: escapeHtml(negocio),
  };

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9999px; background: #1D9E75; color: #fff; font-weight: 600; font-size: 14px; vertical-align: middle;">V</span>
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>Hola${htmlSeguro.saludo ? ` ${htmlSeguro.saludo}` : ""},</p>
  <p>${htmlSeguro.quien} te dio acceso a <strong>VICTOR CFO</strong> para ayudar con la facturación de ${htmlSeguro.negocio} — crear facturas, registrar cobros y ver pendientes, con tu propio correo y contraseña.</p>
  <div style="background: #eefaf4; border-left: 3px solid #1D9E75; padding: 12px 16px; margin: 16px 0; color: #14543d; font-size: 14px;">
    🛡 Este acceso solo cubre facturación. Nunca verás finanzas personales de ${htmlSeguro.quien} ni el total del negocio, a menos que te autorice permisos adicionales puntuales.
  </div>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${acceptUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Crear mi contraseña</a>
  </div>
  <p style="font-size: 12px; color: #666;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/><a href="${acceptUrl}" style="color: #1D9E75; word-break: break-all;">${acceptUrl}</a></p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
  <p style="font-size: 11px; color: #bbb;">Este correo fue enviado porque ${htmlSeguro.quien} te agregó como admin/secretaria en VICTOR CFO. Si no reconoces esta invitación, puedes ignorar este mensaje con confianza.</p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: adminEmail,
      subject: `${quien} te dio acceso a facturación en VICTOR CFO`,
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Envío automático de factura al cliente (3 sept 2026, pedido de Joel: "en
// FreshBooks cuando ponía que una factura era recurrente, automáticamente
// todos los 1 y 15 se enviaban solas") — lo llama el cron de
// facturas-recurrentes justo después de generar la factura hija, para que
// de verdad salga sola en vez de quedarse en borrador esperando que alguien
// la mande a mano. Sin monto en el cuerpo, a propósito — mismo criterio que
// ya existe en el botón "Reenviar" por WhatsApp (factura-detalle.tsx): que
// el cliente lo descubra al abrir el PDF, no antes.
export async function sendInvoiceEmail(params: {
  clientEmail: string;
  clientName: string | null;
  entityName: string | null;
  invoiceId: string;
  invoiceNumber: string;
  dueDate: string | null;
  // Si la entidad ya activó Stripe Connect (migración 0065), el correo
  // añade un segundo botón "Pagar con tarjeta" que apunta al link ESTABLE
  // /api/facturas/[id]/pagar — nunca a una Checkout Session de Stripe
  // directa, porque esas expiran a las 24h y este correo puede abrirse
  // semanas después (3 sept 2026, pedido de Joel).
  cobroTarjetaDisponible?: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { clientEmail, clientName, entityName, invoiceId, invoiceNumber, dueDate, cobroTarjetaDisponible } = params;
  const saludoNombre = clientName || "";
  const negocio = entityName || "";
  const pdfUrl = `${SITE_URL}/api/facturas/${invoiceId}/pdf`;
  const pagarUrl = `${SITE_URL}/api/facturas/${invoiceId}/pagar`;
  const vencePart = dueDate ? ` Vence el ${new Date(`${dueDate}T00:00:00Z`).toLocaleDateString("es-PR", { timeZone: "UTC" })}.` : "";

  const textoPlano =
    `Hola${saludoNombre ? ` ${saludoNombre}` : ""},\n\n` +
    `Aquí tienes tu factura ${invoiceNumber}${negocio ? ` de ${negocio}` : ""}.${vencePart}\n\n` +
    `Puedes verla aquí:\n${pdfUrl}\n\n` +
    (cobroTarjetaDisponible ? `¿Prefieres pagar con tarjeta ahora mismo? ${pagarUrl}\n\n` : "") +
    `¡Gracias por tu confianza!\n\n` +
    `— ${negocio || "VICTOR CFO"}\n` +
    (negocio ? `Enviado a través de VICTOR CFO · ${SITE_URL}\n` : "");

  const htmlSeguro = {
    saludo: saludoNombre ? escapeHtml(saludoNombre) : "",
    negocio: negocio ? escapeHtml(negocio) : "",
    numero: escapeHtml(invoiceNumber),
  };

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <p>Hola${htmlSeguro.saludo ? ` ${htmlSeguro.saludo}` : ""},</p>
  <p>Aquí tienes tu factura <strong>${htmlSeguro.numero}</strong>${htmlSeguro.negocio ? ` de ${htmlSeguro.negocio}` : ""}.${vencePart}</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${pdfUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Ver factura</a>
    ${
      cobroTarjetaDisponible
        ? `<br/><a href="${pagarUrl}" style="display: inline-block; margin-top: 10px; color: #1D9E75; font-weight: 600; text-decoration: none; font-size: 13px;">💳 Pagar con tarjeta ahora</a>`
        : ""
    }
  </div>
  <p style="font-size: 12px; color: #666;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/><a href="${pdfUrl}" style="color: #1D9E75; word-break: break-all;">${pdfUrl}</a></p>
  <p>¡Gracias por tu confianza!</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 11px; color: #bbb;">Enviado a través de VICTOR CFO<br/><a href="${SITE_URL}" style="color: #bbb;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: clientEmail,
      subject: `Factura ${invoiceNumber}${negocio ? ` de ${negocio}` : ""}`,
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}
