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

// Solo la dirección (sin el nombre para mostrar) sacada de FROM — Resend
// exige que el dominio del remitente esté verificado, así que no podemos
// mandar desde el dominio propio de cada negocio (ej. vipmdpr.com); lo que
// SÍ podemos personalizar es el nombre para mostrar. sendInvoiceEmail la usa
// para que el remitente diga "Nombre del Negocio vía VICTOR CFO" en vez de
// solo "VICTOR CFO" — así el cliente reconoce quién le factura de verdad,
// aunque la dirección técnica siga siendo la compartida de la plataforma.
const FROM_ADDRESS = (() => {
  const match = FROM.match(/<(.+)>/);
  return match ? match[1] : FROM;
})();

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

// Aviso de seguridad cuando alguien usa un código de respaldo de MFA (4
// sept 2026) — usar un código de respaldo APAGA la verificación en dos
// pasos de la cuenta (ver /api/mfa/backup-code), así que el dueño real
// necesita enterarse de inmediato: si no fue él, es la primera señal de que
// alguien más tiene acceso a su cuenta.
export async function sendMfaBackupCodeUsedEmail(params: { toEmail: string }): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const textoPlano =
    `Se usó un código de respaldo para entrar a tu cuenta de VICTOR CFO, y por eso la ` +
    `verificación en dos pasos (MFA) se desactivó automáticamente.\n\n` +
    `Si fuiste tú (perdiste el acceso a tu app de autenticación), no tienes que hacer nada más — ` +
    `puedes volver a activar MFA cuando quieras desde Configuración.\n\n` +
    `Si NO fuiste tú, entra a tu cuenta ahora mismo, cambia tu contraseña, y vuelve a activar MFA.\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9999px; background: #1D9E75; color: #fff; font-weight: 600; font-size: 14px; vertical-align: middle;">V</span>
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>Se usó un <strong>código de respaldo</strong> para entrar a tu cuenta, y por eso la verificación en dos pasos (MFA) se desactivó automáticamente.</p>
  <p>Si fuiste tú (perdiste el acceso a tu app de autenticación), no tienes que hacer nada más — puedes volver a activar MFA cuando quieras desde Configuración.</p>
  <p style="color: #B45309;"><strong>Si NO fuiste tú</strong>, entra a tu cuenta ahora mismo, cambia tu contraseña, y vuelve a activar MFA.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: params.toEmail,
      subject: "Se desactivó la verificación en dos pasos de tu cuenta",
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
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

// Aviso de crédito de referido ganado (8 sept 2026, pedido de Joel: "seria
// bueno si se puede que llegara un email... asi es visible pq mucha gente
// ni check casi el email" — de ahí que TAMBIÉN se muestre en una tarjeta
// dentro de la app, ver ReferralLink; este correo es el segundo canal, no
// el único). Lo llama procesarCreditoReferido en
// app/api/stripe/webhook/route.ts justo después de registrar el crédito en
// referral_rewards — nunca antes de que el crédito ya esté aplicado de
// verdad en Stripe, para no avisar de algo que todavía no pasó.
export async function sendReferralCreditEmail(params: {
  toEmail: string;
  toName: string | null;
  // Nombre de la persona referida (8 sept 2026, pedido explícito de Joel:
  // "aqui los nombre son importante... si Luis Perez refirio a Juan Lopez,
  // entonces debería decir 'tu referido Juan Lopez comenzó...'"). Esto SOLO
  // aplica al programa peer-to-peer (amigos/conocidos que ya se conocen
  // entre sí) — el Programa de Socios (comisión en efectivo con
  // CPAs/influencers) se queda anónimo, por eso este email nunca lo usa
  // (procesarComisionSocio no llama esta función). Si por lo que sea no hay
  // nombre guardado, cae de vuelta al genérico "tu referido".
  referredName: string | null;
  creditoCentavos: number;
  parcialPorTope: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName, referredName, creditoCentavos, parcialPorTope } = params;
  const saludoNombre = toName || "";
  const montoTexto = `$${(creditoCentavos / 100).toFixed(2)}`;
  const configUrl = `${SITE_URL}/dashboard/config#referidos`;
  const referidoTexto = referredName ? `tu referido ${referredName}` : "tu referido";

  const notaTope = parcialPorTope
    ? " (esta vez fue un crédito parcial — ya casi llegas al tope anual de tu plan; se reinicia el 1 de enero)"
    : "";

  const textoPlano =
    `Hola${saludoNombre ? ` ${saludoNombre}` : ""},\n\n` +
    `Buenas noticias: ${referidoTexto} comenzó con su plan (el plan Core o Pro) en Victor CFO y ya te ` +
    `ganaste ${montoTexto} de crédito${notaTope} — se descuenta solo de tu próxima factura, no tienes ` +
    `que hacer nada.\n\n` +
    `Puedes ver tu total acumulado y tu link para seguir refiriendo aquí:\n${configUrl}\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = {
    saludo: saludoNombre ? escapeHtml(saludoNombre) : "",
    referido: referredName ? `tu referido ${escapeHtml(referredName)}` : "tu referido",
  };

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9999px; background: #1D9E75; color: #fff; font-weight: 600; font-size: 14px; vertical-align: middle;">V</span>
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>Hola${htmlSeguro.saludo ? ` ${htmlSeguro.saludo}` : ""},</p>
  <p>🎉 Buenas noticias: ${htmlSeguro.referido} comenzó con su plan (el plan Core o Pro) en Victor CFO.</p>
  <div style="text-align: center; margin: 24px 0;">
    <div style="display: inline-block; background: #eefaf4; border: 1px solid #1D9E75; border-radius: 12px; padding: 16px 28px;">
      <div style="font-size: 28px; font-weight: 700; color: #14543d;">${montoTexto}</div>
      <div style="font-size: 13px; color: #14543d;">de crédito ganado</div>
    </div>
  </div>
  ${parcialPorTope ? `<p style="font-size: 13px; color: #B45309;">Esta vez fue un crédito parcial — ya casi llegas al tope anual de tu plan; se reinicia el 1 de enero.</p>` : ""}
  <p>Se descuenta solo de tu próxima factura — no tienes que pedirlo ni hacer nada.</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${configUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Ver mi total acumulado</a>
  </div>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `🎉 Ganaste ${montoTexto} de crédito por un referido`,
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
  // Correo de contacto de la entidad (business_entities.email, migración
  // 0039) — 21 sept 2026, pregunta de Joel: "no se supone que la factura
  // llegue a mis clientes de info@vipmdpr.com?". La respuesta corta es que
  // no podemos mandar desde su dominio (Resend solo tiene victorcfo.com
  // verificado), pero si la entidad tiene un correo de contacto guardado, lo
  // ponemos como Reply-To — así cuando el cliente le dé "Responder", le
  // llega a Joel directo a su correo de negocio, no a VICTOR CFO.
  replyToEmail?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { clientEmail, clientName, entityName, invoiceId, invoiceNumber, dueDate, cobroTarjetaDisponible, replyToEmail } = params;
  const saludoNombre = clientName || "";
  const negocio = entityName || "";
  // Nombre para mostrar personalizado por negocio — la dirección real sigue
  // siendo la de VICTOR CFO (ver FROM_ADDRESS arriba).
  const fromFactura = negocio ? `${negocio} vía VICTOR CFO <${FROM_ADDRESS}>` : FROM;
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
      from: fromFactura,
      to: clientEmail,
      ...(replyToEmail ? { replyTo: replyToEmail } : {}),
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

// Bienvenida al activar el plan (21 sept 2026, pedido de Joel) — lo llama
// checkout.session.completed en app/api/stripe/webhook/route.ts, justo
// después de marcar plan_status="active", así que llega apenas la persona
// termina de pagar (o empieza su trial de 7 días, ver trialDias en
// app/api/stripe/checkout/route.ts). Contenido diferenciado por plan: Core es
// finanzas personales, Pro suma el lado de negocio (Facturación, Pagos,
// Reportes). Si alguien cancela y vuelve a suscribirse pasa por aquí de
// nuevo — no hay guardrail de "ya se le mandó antes" porque un segundo
// correo de bienvenida no hace daño (a diferencia del crédito de
// referidos, que si se duplicara sería dinero real).
export async function sendWelcomeEmail(params: {
  toEmail: string;
  toName: string | null;
  plan: "core" | "pro" | "proplus";
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName, plan } = params;
  const saludoNombre = toName || "";
  const esPro = plan === "pro" || plan === "proplus";
  const dashboardUrl = `${SITE_URL}/dashboard`;

  // Copy personalizada (21 sept 2026, pedido de Joel: "quiero que sea una
  // experiencia personalizada y que el usuario se sienta comprometido") —
  // siempre con el nombre en el saludo, y explicando que la categorización
  // es escalonada (VICTOR necesita ayuda al principio, aprende con el uso)
  // en vez de prometer automatización total desde el día uno.
  const pasosCore: [string, string][] = [
    ["Conecta tus bancos y tarjetas", "Así VICTOR empieza a ver tus gastos e ingresos automáticamente, sin que tengas que anotar nada a mano."],
    ["VICTOR aprende de ti", "Al principio te va a preguntar para categorizar bien tus gastos — mientras más lo uses, más te va a conocer, y más lo va a hacer solo."],
    ["Usa Citas como tu asistente diario", "Agenda tus compromisos ahí y VICTOR te los recuerda, para que no se te olvide nada importante."],
  ];

  const pasosPro: [string, string][] = [
    ["Conecta tus cuentas", "Personal y de negocio — desde Cuentas puedes conectar bancos o tarjetas de ambos lados, cada uno en su espacio."],
    [
      "Activa tu entidad de negocio",
      "Desde Configuración, eso habilita Facturación — puedes cobrar por ATH Móvil Business o con tarjeta vía Stripe activándolo ahí mismo — y registrar Pagos a contratistas o servicios profesionales para organizar tus cuentas (VICTOR no paga por ti, solo lo deja anotado), además de tus Reportes listos para tu contable.",
    ],
    ["Habla con VICTOR", "Te ayuda a categorizar transacciones, crear facturas, y entender tus números — de negocio y personales, siempre disponible abajo a la derecha."],
    // Sin mencionar "invita a tu contable" todavía (21 sept 2026, pedido de
    // Joel: aún no está listo para promoverlo — falta reunirse con su
    // contable para definir cómo quiere que funcione ese flujo antes de
    // ofrecérselo a usuarios nuevos). Cuando esté listo, se añade de vuelta.
    ["Suma tu equipo si lo necesitas", "Invita a una secretaria/admin para que maneje facturación y cobros, o a técnicos si haces trabajo de campo — todo desde Configuración."],
  ];

  const pasos = esPro ? pasosPro : pasosCore;
  const nombrePlan = esPro ? "Pro" : "Core";

  const textoPlano =
    (saludoNombre
      ? `¡Bienvenido, ${saludoNombre}, a VICTOR CFO${esPro ? " Pro" : ""}!\n\n`
      : `¡Bienvenido a VICTOR CFO${esPro ? " Pro" : ""}!\n\n`) +
    `Esto es lo que puedes hacer en tu plan ${nombrePlan}:\n\n` +
    pasos.map(([titulo, texto], i) => `${i + 1}. ${titulo} — ${texto}`).join("\n\n") +
    `\n\nEntra a tu cuenta aquí:\n${dashboardUrl}\n\n` +
    `Cualquier duda, responde este correo — te leemos.\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = { saludo: saludoNombre ? escapeHtml(saludoNombre) : "" };

  const pasosHtml = pasos
    .map(
      ([titulo, texto], i) => `
  <div style="display: flex; gap: 14px; margin-bottom: 20px;">
    <div style="flex-shrink: 0; width: 28px; height: 28px; border-radius: 9999px; background: #eefaf4; color: #14543d; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center;">${i + 1}</div>
    <div>
      <p style="margin: 0 0 4px 0; font-weight: 600;">${escapeHtml(titulo)}</p>
      <p style="margin: 0; color: #555; font-size: 14px;">${escapeHtml(texto)}</p>
    </div>
  </div>`
    )
    .join("");

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9999px; background: #1D9E75; color: #fff; font-weight: 600; font-size: 14px; vertical-align: middle;">V</span>
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${
    htmlSeguro.saludo
      ? `¡Bienvenido, <strong>${htmlSeguro.saludo}</strong>, a VICTOR CFO${esPro ? " Pro" : ""}!`
      : `¡Bienvenido a VICTOR CFO${esPro ? " Pro" : ""}!`
  }</p>
  <p>Esto es lo que puedes hacer en tu plan <strong>${nombrePlan}</strong>:</p>
  <div style="margin: 24px 0;">${pasosHtml}</div>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${dashboardUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Entrar a mi cuenta</a>
  </div>
  <p style="font-size: 14px;">Cualquier duda, <strong>responde este correo</strong> — te leemos.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `Bienvenido a VICTOR CFO ${nombrePlan} — así empiezas`,
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}
