import { Resend } from "resend";
import QRCode from "qrcode";
import { urlBajaCorreos } from "./email-baja";
import type { TipVictor } from "./tips-victor";

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

// Aviso al dueño cuando su contable sube o renueva un documento en Documentos
// compartida (15 oct 2026).
export async function sendDocumentoDeContableEmail(params: {
  toEmail: string;
  contableNombre: string;
  documentoNombre: string;
  renovado: boolean;
  fechaVencimiento: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const accion = params.renovado ? "renovó" : "subió";
  const venceTxt = params.fechaVencimiento ? ` Nueva fecha de vencimiento: ${params.fechaVencimiento}.` : "";
  const link = `${SITE_URL}/dashboard/documentos`;
  const nombre = escapeHtml(params.contableNombre);
  const doc = escapeHtml(params.documentoNombre);

  const textoPlano =
    `Tu contable ${params.contableNombre} ${accion} "${params.documentoNombre}" en tus Documentos de VICTOR.${venceTxt}\n\n` +
    `Míralo aquí: ${link}\n\n` +
    `— VICTOR CFO\nUn producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>Tu contable <strong>${nombre}</strong> ${accion} <strong>${doc}</strong> en tus Documentos.${escapeHtml(venceTxt)}</p>
  <p style="text-align: center; margin: 24px 0;"><a href="${link}" style="background: #0F766E; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver mis Documentos</a></p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: params.toEmail,
      subject: `Tu contable ${accion} un documento en tus Documentos`,
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
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
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
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
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
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

// Invitación de un CPA líder (ej. Héctor) a un colega de su propio equipo
// (ej. Josué) — 2 oct 2026. Distinto de sendCpaInvitationEmail: aquí quien
// invita NO es el dueño del negocio, es el CPA mismo desde su portal. El
// colega, al aceptar, hereda automáticamente todos los clientes activos
// del líder (ver migración 0137 — sync_equipo_cpa), así que el correo deja
// claro que no es "un cliente nuevo", es "entrar al equipo de Fulano".
export async function sendCpaEquipoInvitationEmail(params: {
  staffEmail: string;
  staffName: string | null;
  leadName: string | null;
  leadEmail: string;
  invitationToken: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { staffEmail, staffName, leadName, leadEmail, invitationToken } = params;
  const saludoNombre = staffName ? staffName : "";
  const quien = leadName || leadEmail;
  const acceptUrl = `${SITE_URL}/cpa/equipo/aceptar/${invitationToken}`;

  const textoPlano =
    `Hola${saludoNombre ? ` ${saludoNombre}` : ""},\n\n` +
    `${quien} te invitó a entrar a su equipo en VICTOR CFO, la plataforma de contabilidad que usa ` +
    `con sus clientes.\n\n` +
    `En cuanto aceptes, vas a ver automáticamente los mismos clientes que ${quien} ya tiene en VICTOR ` +
    `(acceso de solo lectura, igual que el de ${quien}) — y cualquier cliente nuevo que ${quien} agregue ` +
    `después también lo vas a ver sin que nadie tenga que invitarte otra vez.\n\n` +
    `Para activar tu acceso, entra aquí:\n${acceptUrl}\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}\n\n` +
    `Este correo fue enviado porque ${quien} te agregó a su equipo en VICTOR CFO. Si no reconoces esta ` +
    `invitación, puedes ignorar este mensaje con confianza.`;

  const htmlSeguro = {
    saludo: saludoNombre ? escapeHtml(saludoNombre) : "",
    quien: escapeHtml(quien),
  };

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>Hola${htmlSeguro.saludo ? ` ${htmlSeguro.saludo}` : ""},</p>
  <p>${htmlSeguro.quien} te invitó a entrar a su <strong>equipo en VICTOR CFO</strong>, la plataforma de contabilidad que usa con sus clientes.</p>
  <p>En cuanto aceptes, vas a ver automáticamente los mismos clientes que ${htmlSeguro.quien} ya tiene (acceso de <strong>solo lectura</strong>, igual que el de ${htmlSeguro.quien}) — y cualquier cliente nuevo que agregue después también lo vas a ver sin que nadie tenga que invitarte otra vez.</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${acceptUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Activar mi acceso</a>
  </div>
  <p style="font-size: 12px; color: #666;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/><a href="${acceptUrl}" style="color: #1D9E75; word-break: break-all;">${acceptUrl}</a></p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
  <p style="font-size: 11px; color: #bbb;">Este correo fue enviado porque ${htmlSeguro.quien} te agregó a su equipo en VICTOR CFO. Si no reconoces esta invitación, puedes ignorar este mensaje con confianza.</p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: staffEmail,
      subject: `${quien} te invitó a su equipo en VICTOR CFO`,
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Invitación del programa "Firma Accountant" (4 oct 2026, migración 0139)
// — a diferencia de sendCpaEquipoInvitationEmail (acceso de solo lectura
// a clientes ajenos), esta invitación crea una cuenta COMPLETA de VICTOR
// CFO plan Business para el cliente nuevo, pagada por la firma del
// contador. El correo lo deja explícito: el cliente usa su propia cuenta
// todos los días, solo que no la paga él.
export async function sendFirmaInvitationEmail(params: {
  clienteEmail: string;
  nombreNegocio: string | null;
  firmaName: string | null;
  firmaEmail: string;
  invitationToken: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { clienteEmail, nombreNegocio, firmaName, firmaEmail, invitationToken } = params;
  const quien = firmaName || firmaEmail;
  const saludoNegocio = nombreNegocio ? ` para ${nombreNegocio}` : "";
  const acceptUrl = `${SITE_URL}/firma/aceptar/${invitationToken}`;

  const textoPlano =
    `Hola,\n\n` +
    `${quien} te está regalando una cuenta completa de VICTOR CFO (plan Business)${saludoNegocio} — ` +
    `incluida en el servicio de contabilidad que ya tienes con ${quien}, sin costo adicional para ti.\n\n` +
    `Vas a poder conectar tu banco, facturar, registrar pagos a tus contratistas y hablar con VICTOR todos los ` +
    `días — exactamente igual que cualquier cliente que paga el plan completo. La diferencia es que la ` +
    `mensualidad la cubre ${quien}, no tú.\n\n` +
    `Para activar tu cuenta y poner tu contraseña, entra aquí:\n${acceptUrl}\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}\n\n` +
    `Este correo fue enviado porque ${quien} te invitó a VICTOR CFO. Si no reconoces esta invitación, ` +
    `puedes ignorar este mensaje con confianza.`;

  const htmlSeguro = {
    quien: escapeHtml(quien),
    saludoNegocio: nombreNegocio ? ` para ${escapeHtml(nombreNegocio)}` : "",
  };

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>Hola,</p>
  <p>${htmlSeguro.quien} te está regalando una cuenta completa de VICTOR CFO (<strong>plan Business</strong>)${htmlSeguro.saludoNegocio} — incluida en el servicio de contabilidad que ya tienes con ${htmlSeguro.quien}, sin costo adicional para ti.</p>
  <p>Vas a poder conectar tu banco, facturar, registrar pagos a tus contratistas y hablar con VICTOR todos los días — exactamente igual que cualquier cliente que paga el plan completo. La diferencia es que la mensualidad la cubre ${htmlSeguro.quien}, no tú.</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${acceptUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Activar mi cuenta</a>
  </div>
  <p style="font-size: 12px; color: #666;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br/><a href="${acceptUrl}" style="color: #1D9E75; word-break: break-all;">${acceptUrl}</a></p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
  <p style="font-size: 11px; color: #bbb;">Este correo fue enviado porque ${htmlSeguro.quien} te invitó a VICTOR CFO. Si no reconoces esta invitación, puedes ignorar este mensaje con confianza.</p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: clienteEmail,
      subject: `${quien} te regaló una cuenta de VICTOR CFO`,
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
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
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
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
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

// Crédito pendiente de activación para referidor en plan gratis (25 sept
// 2026, migración 0099, pedido de Joel: "fulano que referiste acaba de
// hacer su pago... tienes $$$ ahora puedas activar tu plan, y una fecha
// para que lo use, sino pues los pierde — esa es la idea que siga
// refiriendo y le salga gratis a él"). A diferencia de
// sendReferralCreditEmail (que avisa de un crédito YA aplicado a una
// factura), este avisa de un crédito que todavía hay que CANJEAR activando
// un plan de pago (con tarjeta) dentro de 30 días — se convierte en días
// extra de trial en el checkout (ver app/api/stripe/checkout/route.ts), no
// en un descuento en efectivo.
export async function sendReferralCreditoPendienteEmail(params: {
  toEmail: string;
  toName: string | null;
  referredName: string | null;
  creditoCentavos: number;
  expiraEn: Date;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName, referredName, creditoCentavos, expiraEn } = params;
  const saludoNombre = toName || "";
  const montoTexto = `$${(creditoCentavos / 100).toFixed(2)}`;
  const referidoTexto = referredName ? referredName : "tu referido";
  const fechaTexto = expiraEn.toLocaleDateString("es-PR", { timeZone: "America/Puerto_Rico", day: "numeric", month: "long" });
  const activarUrl = `${SITE_URL}/dashboard/config#referidos`;

  const textoPlano =
    `Hola${saludoNombre ? ` ${saludoNombre}` : ""},\n\n` +
    `Buenas noticias: ${referidoTexto} acaba de empezar a pagar su plan en VICTOR CFO. Como tú todavía estás en el plan gratis, ` +
    `te ganaste ${montoTexto} en días gratis para cuando actives tu propio plan (Core o Pro) — se te suman como días de prueba ` +
    `extra al momento de activarlo, así que no pagas nada hasta que se acaben.\n\n` +
    `Ojo: tienes hasta el ${fechaTexto} para activarlo, si no, lo pierdes. Y mientras más gente refieras, más días gratis ` +
    `acumulas — puede salirte completamente gratis si sigues refiriendo.\n\n` +
    `Actívalo aquí:\n${activarUrl}\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = {
    saludo: saludoNombre ? escapeHtml(saludoNombre) : "",
    referido: escapeHtml(referidoTexto),
  };

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>Hola${htmlSeguro.saludo ? ` ${htmlSeguro.saludo}` : ""},</p>
  <p>🎉 Buenas noticias: <strong>${htmlSeguro.referido}</strong> acaba de empezar a pagar su plan en VICTOR CFO.</p>
  <div style="text-align: center; margin: 24px 0;">
    <div style="display: inline-block; background: #eefaf4; border: 1px solid #1D9E75; border-radius: 12px; padding: 16px 28px;">
      <div style="font-size: 28px; font-weight: 700; color: #14543d;">${montoTexto}</div>
      <div style="font-size: 13px; color: #14543d;">en días gratis para tu propio plan</div>
    </div>
  </div>
  <p>Como todavía estás en el plan gratis, esto se te suma como días de prueba extra cuando actives Core o Pro — no pagas nada hasta que se acaben.</p>
  <div style="background: #FEF3E2; border: 1px solid #D97706; border-radius: 10px; padding: 14px; margin: 20px 0;">
    <p style="margin: 0; font-size: 14px; color: #B45309;"><strong>Tienes hasta el ${fechaTexto}</strong> para activarlo — si no, lo pierdes.</p>
  </div>
  <p style="font-size: 14px;">Y mientras más gente refieras, más días acumulas — puede salirte completamente gratis si sigues refiriendo.</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${activarUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Activar mi plan</a>
  </div>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `🎉 ${montoTexto} en días gratis te esperan — actívalos antes del ${fechaTexto}`,
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
  // Portal en línea del cliente (migración 0157): si viene, el correo añade un
  // enlace discreto a "todas tus facturas".
  portalUrl?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { clientEmail, clientName, entityName, invoiceId, invoiceNumber, dueDate, cobroTarjetaDisponible, replyToEmail, portalUrl } = params;
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
    (portalUrl ? `Todas tus facturas en un solo lugar: ${portalUrl}\n\n` : "") +
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
  ${portalUrl ? `<p style="font-size: 13px;"><a href="${portalUrl}" style="color: #1D9E75;">Ver todas mis facturas</a></p>` : ""}
  <p>¡Gracias por tu confianza!</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">¿Tienes un negocio? Factura y cobra fácil con <a href="${SITE_URL}/?utm_source=email-factura" style="color: #1D9E75;">VICTOR CFO</a>.</p>
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
    ["Conecta tus bancos y tarjetas", "Así VICTOR empieza a ver tus gastos e ingresos automáticamente, sin que tengas que anotar nada a mano. La conexión la maneja Plaid directo con tu banco — el mismo sistema que usan Venmo, Chime, American Express y Robinhood — así que VICTOR nunca ve ni guarda tu contraseña, solo recibe tus transacciones. Aquí en Puerto Rico, Plaid conecta bien bancos locales como BPPR, FirstBank, Oriental y Mercury, algo que QuickBooks Online no siempre logra. Si prefieres no conectar el banco todavía, también puedes subir tus estados de cuenta (CSV o PDF) y categorizamos igual."],
    ["VICTOR aprende de ti", "Al principio te va a preguntar para categorizar bien tus gastos — mientras más lo uses, más te va a conocer, y más lo va a hacer solo."],
    ["Usa Citas como tu asistente diario", "Agenda tus compromisos ahí y VICTOR te los recuerda, para que no se te olvide nada importante."],
    ["Pon tus Metas y guarda documentos", "En Metas puedes trackear para qué estás ahorrando, y en Documentos guardar pólizas, contratos o cualquier documento importante."],
  ];

  // Pro lleva TODO lo de Core (aprende de ti, Citas, Metas/Documentos) más lo
  // propio de negocio (21 sept 2026, pedido de Joel: "añádele a Pro lo que
  // le falta de Core más lo de Pro") — un usuario Pro también tiene lado
  // personal, así que no pierde esos pasos por pagar el plan más caro.
  const pasosPro: [string, string][] = [
    ["Conecta tus cuentas", "Personal y de negocio — desde Cuentas puedes conectar bancos o tarjetas de ambos lados, cada uno en su espacio. La conexión la maneja Plaid directo con tu banco — el mismo sistema que usan Venmo, Chime, American Express y Robinhood — así que VICTOR nunca ve ni guarda tu contraseña, solo recibe tus transacciones. Aquí en Puerto Rico, Plaid conecta bien bancos locales como BPPR, FirstBank, Oriental y Mercury, algo que QuickBooks Online no siempre logra. Si prefieres no conectar el banco todavía, también puedes subir tus estados de cuenta (CSV o PDF) y categorizamos igual."],
    [
      "Activa tu entidad de negocio",
      "Desde Configuración, eso habilita Facturación — puedes cobrar por ATH Móvil Business o con tarjeta vía Stripe activándolo ahí mismo — y registrar Pagos a contratistas o servicios profesionales para organizar tus cuentas (VICTOR no paga por ti, solo lo deja anotado), además de tus Reportes listos para tu contable.",
    ],
    ["VICTOR aprende de ti", "Al principio te va a preguntar para categorizar bien tus gastos — mientras más lo uses, más te va a conocer, y más lo va a hacer solo. También le puedes pedir que te cree una factura o te explique tus números, de negocio o personales, siempre disponible abajo a la derecha."],
    ["Usa Citas como tu asistente diario", "Agenda tus compromisos ahí y VICTOR te los recuerda, para que no se te olvide nada importante."],
    ["Pon tus Metas y guarda documentos", "En Metas puedes trackear para qué estás ahorrando, y en Documentos guardar pólizas, contratos o cualquier documento importante."],
    // Sin mencionar "invita a tu contable" todavía (21 sept 2026, pedido de
    // Joel: aún no está listo para promoverlo — falta reunirse con su
    // contable para definir cómo quiere que funcione ese flujo antes de
    // ofrecérselo a usuarios nuevos). Cuando esté listo, se añade de vuelta.
    ["Suma tu equipo si lo necesitas", "Invita a una secretaria/admin para que maneje facturación y cobros, o a tus técnicos si tienes personal que hace instalaciones o visitas a clientes — todo desde Configuración."],
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
    `Cualquier duda o pregunta, escríbenos a soporte@victorcfo.com y te responderemos en la brevedad posible.\n\n` +
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
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
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
  <p style="font-size: 14px;">Cualquier duda o pregunta, escríbenos a <a href="mailto:soporte@victorcfo.com" style="color: #1D9E75;">soporte@victorcfo.com</a> y te responderemos en la brevedad posible.</p>
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

// Bienvenida al REGISTRO, no al pago (21 sept 2026, pedido de Joel: "que se
// envien cuando se registre el cliente pague o no — si ya pagó se lo merece
// y si no pagó lo motiva a pagar"). sendWelcomeEmail (arriba) sigue
// disparando solo cuando Stripe confirma el pago — estas dos funciones
// cubren el hueco de todo el que se registra y todavía no llegó ahí: el
// plan gratis (que nunca pasa por Stripe) y el que eligió pagar pero no
// completó el checkout. Llamadas desde lib/bienvenida-inicial.ts.
export async function sendWelcomeGratisEmail(params: {
  toEmail: string;
  toName: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName } = params;
  const saludoNombre = toName || "";
  const dashboardUrl = `${SITE_URL}/dashboard`;

  // El plan gratis NO tiene chat con VICTOR ni conexión de banco (ver
  // app/dashboard/victor-chat.tsx, bloqueado = plan==='gratis') — esta copy
  // solo promete lo que de verdad tiene, y es honesta en que gran parte del
  // trabajo (categorizar, recordar) lo hace la persona, no VICTOR. Sin eso
  // el correo prometía implícitamente un asistente que el plan gratis no
  // tiene, y quien lo abriera esperando eso se iba a sentir engañado.
  //
  // 25 sept 2026, reescrito con Joel: (1) se quitó "ahora mismo" del
  // encabezado — hacía sentir la lista como algo menor/de consuelo en vez
  // de un beneficio real; (2) los pasos van en el orden real en que se
  // usan (primero agregar la cuenta, LUEGO subir el estado — antes estaban
  // al revés); (3) se aclaró en cada paso que la persona categoriza y
  // agenda ella misma, VICTOR no está haciendo nada por detrás en este
  // plan — esa es la razón real de pagar, no un genérico "desbloquea más";
  // (4) el cierre vende el upgrade explicando qué hace VICTOR de verdad
  // (categoriza, recuerda citas, avisa de documentos pendientes) en vez de
  // solo el precio.
  const pasos: [string, string][] = [
    ["Elige cómo empezar: subir archivo o anotar a mano", "Tienes dos caminos y los dos funcionan. Si subes el CSV, Excel o PDF de tu banco desde Cuentas, VICTOR calcula todo por ti. Si prefieres anotar a mano, el primer paso es poner lo que tienes hoy: toca \"Anotar mi balance\" en Inicio."],
    ["Si anotas a mano, empieza con tu balance de hoy", "Escribe cuánto tienes en tu balance el día que empiezas y, a partir de ese día, anota todos tus ingresos y gastos. Así tu balance sube y baja bien. Si empiezas a anotar sin el balance de partida, el cálculo arranca en cero y se va en negativo. Toca Ingresos (monto, fecha y de dónde vino) o Gastos (monto, fecha y categoría), y si te equivocas, edita o borra en Transacciones."],
    ["Ahorros, inversiones y deudas", "Toca las tarjetas de Ahorrado e Inversiones para poner su saldo actual, y en Deuda añade tus tarjetas y préstamos para ver cómo salir de ellas."],
    ["Planifica con tus herramientas gratis", "Calcula cómo salir de deudas (bola de nieve o avalancha), arma tu plan 50/30/20, usa la calculadora de ahorro y guarda tus compromisos en Citas."],
    ["Instala la app en tu celular y activa las notificaciones", "En iPhone: abre victorcfo.com en Safari, toca Compartir y luego \"Añadir a pantalla de inicio\". En Android: abre victorcfo.com en Chrome, toca los tres puntos y elige \"Instalar app\". Después abre VICTOR desde su ícono, ve a Configuración y activa Notificaciones (acepta el permiso cuando te lo pida). Así te llegan los avisos de tus citas y documentos por vencer. En iPhone las notificaciones solo funcionan si la abres desde el ícono instalado."],
  ];

  const textoPlano =
    (saludoNombre ? `¡Bienvenido, ${saludoNombre}, a VICTOR CFO!\n\n` : `¡Bienvenido a VICTOR CFO!\n\n`) +
    `Así le sacas provecho a tu cuenta gratis, paso a paso:\n\n` +
    pasos.map(([titulo, texto], i) => `${i + 1}. ${titulo} — ${texto}`).join("\n\n") +
    `\n\nPiénsalo como tu Excel de siempre, pero con balance que se actualiza solo y todo editable.\n\n` +
    `Para la experiencia completa — que VICTOR categorice tus transacciones automáticamente, te recuerde tus citas y avise de documentos pendientes antes de que venzan — puedes escoger un plan: Core (personal) o Pro (si tienes negocio).\n\n` +
    `Entra a tu cuenta aquí:\n${dashboardUrl}\n\n` +
    `Cualquier duda o pregunta, escríbenos a soporte@victorcfo.com y te responderemos en la brevedad posible.\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = saludoNombre ? escapeHtml(saludoNombre) : "";

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
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${htmlSeguro ? `¡Bienvenido, <strong>${htmlSeguro}</strong>, a VICTOR CFO!` : `¡Bienvenido a VICTOR CFO!`}</p>
  <p>Así le sacas provecho a tu cuenta <strong>gratis</strong>, paso a paso:</p>
  <div style="margin: 24px 0;">${pasosHtml}</div>
  <p style="font-size: 14px; color: #555;">Piénsalo como tu Excel de siempre, pero con balance que se actualiza solo y todo editable.</p>
  <div style="background: #f6faf8; border: 1px solid #d8ece4; border-radius: 10px; padding: 16px; margin: 24px 0;">
    <p style="margin: 0 0 6px 0; font-weight: 600; font-size: 14px;">Para la experiencia completa, con Core o Pro:</p>
    <p style="margin: 0; font-size: 14px; color: #333;">VICTOR categoriza tus transacciones automáticamente, te recuerda tus citas y avisa de documentos pendientes antes de que venzan.</p>
  </div>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${dashboardUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Entrar a mi cuenta</a>
  </div>
  <p style="font-size: 14px;">Cualquier duda o pregunta, escríbenos a <a href="mailto:soporte@victorcfo.com" style="color: #1D9E75;">soporte@victorcfo.com</a> y te responderemos en la brevedad posible.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "Bienvenido a VICTOR CFO — así empiezas gratis",
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Se registró eligiendo pagar (Core/Pro), pero el checkout de Stripe no se
// completó todavía (cerró la pestaña, se le fue la conexión, etc.) — sin
// esto, esa persona no recibía NADA nunca (ver comentario arriba). El link
// manda de vuelta a completar-pago, mismo destino que usa la propia app
// cuando el checkout falla (ver app/registro/page.tsx).
export async function sendCasiTerminasEmail(params: {
  toEmail: string;
  toName: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName } = params;
  const saludoNombre = toName || "";
  const completarPagoUrl = `${SITE_URL}/registro/completar-pago`;

  const textoPlano =
    (saludoNombre ? `Hola ${saludoNombre},\n\n` : `Hola,\n\n`) +
    `Creaste tu cuenta en VICTOR CFO, pero tu plan todavía no está activo porque falta completar el pago. Te toma un minuto:\n\n` +
    `${completarPagoUrl}\n\n` +
    `En cuanto lo completes tienes acceso a todo: conectar tu banco automático, hablar con VICTOR para categorizar tus gastos y resolver dudas al momento, Facturación si tienes negocio, y más.\n\n` +
    `Cualquier duda o pregunta, escríbenos a soporte@victorcfo.com y te responderemos en la brevedad posible.\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = saludoNombre ? escapeHtml(saludoNombre) : "";

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${htmlSeguro ? `Hola, <strong>${htmlSeguro}</strong>,` : `Hola,`}</p>
  <p>Creaste tu cuenta en VICTOR CFO, pero tu plan todavía no está activo porque falta completar el pago. Te toma un minuto.</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${completarPagoUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Completar mi pago</a>
  </div>
  <p style="font-size: 14px;">En cuanto lo completes tienes acceso a todo: conectar tu banco automático, hablar con VICTOR para categorizar tus gastos y resolver dudas al momento, Facturación si tienes negocio, y más.</p>
  <p style="font-size: 14px;">Cualquier duda o pregunta, escríbenos a <a href="mailto:soporte@victorcfo.com" style="color: #1D9E75;">soporte@victorcfo.com</a> y te responderemos en la brevedad posible.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "Ya casi terminas — activa tu plan en VICTOR CFO",
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Recordatorio de onboarding incompleto (22 sept 2026) — a diferencia de
// sendCasiTerminasEmail (que persigue el PAGO), este persigue la
// conversación con VICTOR: el usuario ya pagó/activó su plan, pero cerró
// el chat antes de que VICTOR terminara de conocerlo (apodo, situación,
// etc. — ver migración 0008), así que perfil_completo sigue en false y el
// saludo proactivo diario nunca lo vuelve a buscar (ver migración 0014).
// Se manda UNA sola vez por usuario (recordatorio_onboarding_enviado,
// migración 0093), no en cadena.
export async function sendRecordatorioOnboardingEmail(params: {
  toEmail: string;
  toName: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName } = params;
  const saludoNombre = toName || "";
  const dashboardUrl = `${SITE_URL}/dashboard`;

  const textoPlano =
    (saludoNombre ? `Hola ${saludoNombre},\n\n` : `Hola,\n\n`) +
    `Notamos que empezaste a configurar tu cuenta en VICTOR CFO, pero la conversación con VICTOR se quedó a medias — todavía no terminamos de conocerte.\n\n` +
    `Es rápido, un par de preguntas nada más, y con eso VICTOR puede empezar a trabajar de verdad por ti: avisarte de gastos sin categorizar, documentos por vencer, y resumirte tus finanzas cada mañana sin que tengas que preguntarle.\n\n` +
    `${dashboardUrl}\n\n` +
    `Cualquier duda o pregunta, escríbenos a soporte@victorcfo.com y te respondemos en la brevedad posible.\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = saludoNombre ? escapeHtml(saludoNombre) : "";

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${htmlSeguro ? `Hola, <strong>${htmlSeguro}</strong>,` : `Hola,`}</p>
  <p>Notamos que empezaste a configurar tu cuenta, pero la conversación con VICTOR se quedó a medias — todavía no terminamos de conocerte.</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${dashboardUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Terminar de conocer a VICTOR</a>
  </div>
  <p style="font-size: 14px;">Es rápido, un par de preguntas nada más, y con eso VICTOR puede empezar a trabajar de verdad por ti: avisarte de gastos sin categorizar, documentos por vencer, y resumirte tus finanzas cada mañana sin que tengas que preguntarle.</p>
  <p style="font-size: 14px;">Cualquier duda o pregunta, escríbenos a <a href="mailto:soporte@victorcfo.com" style="color: #1D9E75;">soporte@victorcfo.com</a> y te respondemos en la brevedad posible.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "Nos quedamos a medias conociéndote — termina tu perfil con VICTOR",
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Agente de soporte por email (21 sept 2026, pedido de Joel: "crear un
// agente que conteste lo que sea que esté en nuestro manual... btw el
// agente es Victor CFO"). Responde EN EL MISMO HILO del correo que llegó a
// soporte@victorcfo.com — de ahí el header In-Reply-To con el message_id
// que Resend Inbound entrega en el webhook (ver app/api/soporte/inbound).
// Firma como VICTOR (no como "el equipo de soporte") porque así lo pidió
// Joel — es el mismo asistente que ya conoce el usuario en la app.
export async function sendRespuestaSoporteEmail(params: {
  toEmail: string;
  asuntoOriginal: string;
  messageIdOriginal: string;
  respuesta: string;
}): Promise<{ sent: boolean; reason?: string; emailId?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, asuntoOriginal, messageIdOriginal, respuesta } = params;
  const asuntoRespuesta = asuntoOriginal.toLowerCase().startsWith("re:") ? asuntoOriginal : `Re: ${asuntoOriginal}`;

  const textoPlano = `${respuesta}\n\n— VICTOR\nVICTOR CFO · ${SITE_URL}`;

  const htmlRespuesta = escapeHtml(respuesta).replace(/\n/g, "<br/>");
  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.6;">
  <div style="margin-bottom: 20px;">
    <img src="${SITE_URL}/victor-avatar.png" width="28" height="28" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 16px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR</span>
  </div>
  <p style="font-size: 14px;">${htmlRespuesta}</p>
  <p style="font-size: 14px; margin-top: 20px;">— VICTOR</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: asuntoRespuesta,
      text: textoPlano,
      html: htmlCorreo,
      headers: {
        "In-Reply-To": messageIdOriginal,
        References: messageIdOriginal,
      },
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true, emailId: data?.id };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Escalación a Joel cuando VICTOR no encuentra la respuesta en el manual —
// "ya si es algo que no tenemos que lo derive a mi". Va a info@victorcfo.com
// (bandeja aparte de soporte@, que es donde llegan las preguntas de
// clientes — ver comentario en app/api/soporte/inbound/route.ts) con todo
// el contexto para que él conteste directo, respondiendo a esta
// notificación con "Cc" o reenviando al cliente.
//
// 22 sept 2026 — un correo de prueba a soporte@victorcfo.com nunca disparó
// el webhook (ni respuesta ni escalación); todo apunta a que el DNS de
// recepción de Resend para ese buzón no quedó completo. direccionesPropias()
// en el webhook ya incluye info@ de forma defensiva por si en algún momento
// ese buzón también queda conectado a Resend Inbound.
export async function sendEscalacionSoporteEmail(params: {
  deEmail: string;
  deNombre: string | null;
  asunto: string;
  cuerpo: string;
  motivo: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { deEmail, deNombre, asunto, cuerpo, motivo } = params;
  // info@victorcfo.com (21 sept 2026, pedido de Joel: las escalaciones no
  // deben mezclarse con su Gmail personal) — bandeja real de Workspace,
  // separada de dr.jvalentin@gmail.com, que Joel revisa aparte.
  const joelEmail = "info@victorcfo.com";
  const remitente = deNombre ? `${deNombre} <${deEmail}>` : deEmail;

  const textoPlano =
    `VICTOR no pudo contestar este correo de soporte con lo que hay en el manual — hace falta que lo veas tú.\n\n` +
    `De: ${remitente}\n` +
    `Asunto: ${asunto}\n` +
    `Por qué se escaló: ${motivo}\n\n` +
    `--- Correo original ---\n${cuerpo}\n\n` +
    `Puedes responderle directo a ${deEmail}.`;

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <p style="font-size: 14px;">VICTOR no pudo contestar este correo de soporte con lo que hay en el manual — hace falta que lo veas tú.</p>
  <table style="width: 100%; font-size: 13px; margin: 16px 0; border-collapse: collapse;">
    <tr><td style="padding: 4px 0; color: #999; width: 90px;">De</td><td>${escapeHtml(remitente)}</td></tr>
    <tr><td style="padding: 4px 0; color: #999;">Asunto</td><td>${escapeHtml(asunto)}</td></tr>
    <tr><td style="padding: 4px 0; color: #999;">Motivo</td><td>${escapeHtml(motivo)}</td></tr>
  </table>
  <div style="background: #f7f7f7; border-radius: 8px; padding: 16px; font-size: 13px; white-space: pre-wrap;">${escapeHtml(cuerpo)}</div>
  <p style="font-size: 13px; margin-top: 16px;">Puedes responderle directo a <a href="mailto:${deEmail}" style="color: #1D9E75;">${deEmail}</a>.</p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: joelEmail,
      replyTo: deEmail,
      subject: `[Soporte VICTOR — revisar] ${asunto}`,
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// "Seguimientos de clientes" (24 sept 2026, pedido de Joel — ver el
// comentario grande en factura-detalle.tsx). A DIFERENCIA de
// sendInvoiceEmail, este correo NO es una factura ni una cotización — es un
// mensaje amistoso de "ya te toca" para negocios de mantenimiento (A/C,
// fumigación, etc.) cuyo cliente lleva meses sin volver. Joel fue explícito
// en que esto no debía sentirse como cobro frío: "no se le va a enviar una
// factura o una cotización fria". Lo dispara app/api/cron/seguimientos-clientes.
export async function sendFollowUpReminderEmail(params: {
  clientEmail: string;
  clientName: string | null;
  entityName: string | null;
  servicioNombre: string;
  fechaUltimoServicio: string | null;
  replyToEmail?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { clientEmail, clientName, entityName, servicioNombre, fechaUltimoServicio, replyToEmail } = params;
  const saludoNombre = clientName || "";
  const negocio = entityName || "";
  const fromRecordatorio = negocio ? `${negocio} vía VICTOR CFO <${FROM_ADDRESS}>` : FROM;
  const ultimaVezPart = fechaUltimoServicio
    ? ` Tu último ${servicioNombre.toLowerCase()} fue el ${new Date(`${fechaUltimoServicio}T00:00:00Z`).toLocaleDateString("es-PR", { timeZone: "UTC" })}.`
    : "";

  const textoPlano =
    `Hola${saludoNombre ? ` ${saludoNombre}` : ""},\n\n` +
    `Te escribimos${negocio ? ` de parte de ${negocio}` : ""} porque ya se acerca (o ya pasó) la fecha de tu próximo ${servicioNombre}.${ultimaVezPart}\n\n` +
    `Si quieres coordinar, contéstanos este correo y lo agendamos.\n\n` +
    `¡Gracias por tu confianza!\n\n` +
    `— ${negocio || "VICTOR CFO"}\n`;

  const htmlSeguro = {
    saludo: saludoNombre ? escapeHtml(saludoNombre) : "",
    negocio: negocio ? escapeHtml(negocio) : "",
    servicio: escapeHtml(servicioNombre),
  };

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <p>Hola${htmlSeguro.saludo ? ` ${htmlSeguro.saludo}` : ""},</p>
  <p>Te escribimos${htmlSeguro.negocio ? ` de parte de <strong>${htmlSeguro.negocio}</strong>` : ""} porque ya se acerca (o ya pasó) la fecha de tu próximo <strong>${htmlSeguro.servicio}</strong>.${ultimaVezPart}</p>
  <p>Si quieres coordinar, solo contesta este correo y lo agendamos.</p>
  <p>¡Gracias por tu confianza!</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">¿Tienes un negocio? Factura y cobra fácil con <a href="${SITE_URL}/?utm_source=email-recordatorio" style="color: #1D9E75;">VICTOR CFO</a>.</p>
  <p style="font-size: 11px; color: #bbb;">Enviado a través de VICTOR CFO<br/><a href="${SITE_URL}" style="color: #bbb;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: fromRecordatorio,
      to: clientEmail,
      ...(replyToEmail ? { replyTo: replyToEmail } : {}),
      subject: `${negocio ? `${negocio}: ` : ""}¿Coordinamos tu próximo ${servicioNombre}?`,
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Recordatorio amable de factura vencida (15 oct 2026, auditoría de
// facturación vs FreshBooks). Lo dispara app/api/cron/recordatorios-cobro solo
// para entidades que activaron recordatorios_cobro_activos (migración 0157).
// A diferencia del correo de la factura, aquí SÍ va el monto y la fecha de
// vencimiento — es un aviso de cobro, no una sorpresa en el PDF — pero el tono
// es cordial y siempre con el link de pago si la entidad cobra con tarjeta.
export async function sendRecordatorioCobroEmail(params: {
  clientEmail: string;
  clientName: string | null;
  entityName: string | null;
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  dueDate: string;
  diasVencida: number;
  numeroRecordatorio: number;
  cobroTarjetaDisponible?: boolean;
  replyToEmail?: string | null;
  portalUrl?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { clientEmail, clientName, entityName, invoiceId, invoiceNumber, total, dueDate, diasVencida, numeroRecordatorio, cobroTarjetaDisponible, replyToEmail, portalUrl } = params;
  const saludoNombre = clientName || "";
  const negocio = entityName || "";
  const fromRecordatorio = negocio ? `${negocio} vía VICTOR CFO <${FROM_ADDRESS}>` : FROM;
  const pdfUrl = `${SITE_URL}/api/facturas/${invoiceId}/pdf`;
  const pagarUrl = `${SITE_URL}/api/facturas/${invoiceId}/pagar`;
  const montoTxt = `$${Number(total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const venceTxt = new Date(`${dueDate}T00:00:00Z`).toLocaleDateString("es-PR", { timeZone: "UTC" });
  const intro =
    numeroRecordatorio <= 1
      ? `Un recordatorio amable: la factura ${invoiceNumber}${negocio ? ` de ${negocio}` : ""} por ${montoTxt} venció el ${venceTxt}.`
      : `Te escribimos de nuevo sobre la factura ${invoiceNumber}${negocio ? ` de ${negocio}` : ""} por ${montoTxt}, vencida desde el ${venceTxt} (${diasVencida} días).`;

  const textoPlano =
    `Hola${saludoNombre ? ` ${saludoNombre}` : ""},\n\n` +
    `${intro} Si ya la pagaste, ignora este mensaje y gracias.\n\n` +
    `Puedes verla aquí:\n${pdfUrl}\n\n` +
    (cobroTarjetaDisponible ? `Pagar con tarjeta: ${pagarUrl}\n\n` : "") +
    (portalUrl ? `Todas tus facturas: ${portalUrl}\n\n` : "") +
    `Si tienes alguna duda, contesta este correo.\n\n` +
    `— ${negocio || "VICTOR CFO"}\n`;

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <p>Hola${saludoNombre ? ` ${escapeHtml(saludoNombre)}` : ""},</p>
  <p>${escapeHtml(intro)} Si ya la pagaste, ignora este mensaje y gracias.</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${pdfUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Ver factura</a>
    ${
      cobroTarjetaDisponible
        ? `<br/><a href="${pagarUrl}" style="display: inline-block; margin-top: 10px; color: #1D9E75; font-weight: 600; text-decoration: none; font-size: 13px;">💳 Pagar con tarjeta ahora</a>`
        : ""
    }
  </div>
  ${portalUrl ? `<p style="font-size: 13px;"><a href="${portalUrl}" style="color: #1D9E75;">Ver todas mis facturas</a></p>` : ""}
  <p>Si tienes alguna duda, solo contesta este correo.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 11px; color: #bbb;">Enviado a través de VICTOR CFO<br/><a href="${SITE_URL}" style="color: #bbb;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: fromRecordatorio,
      to: clientEmail,
      ...(replyToEmail ? { replyTo: replyToEmail } : {}),
      subject: `${numeroRecordatorio <= 1 ? "Recordatorio" : "Aviso"}: factura ${invoiceNumber}${negocio ? ` de ${negocio}` : ""}`,
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// ============================================================================
// Secuencia de nurture para plan gratis (25 sept 2026, migración 0098) —
// pedido de Joel: ya que capturamos el email en el registro gratis de 1
// clic, aprovechar esa dirección para convertir a Core/Pro con 2 correos
// más además de la bienvenida del día 0 (sendWelcomeGratisEmail):
//   día 2 — sendNurtureFeaturesGratisEmail: qué puede hacer YA sin pagar
//   día 5 — sendNurtureTrialOfertaEmail: empuje a probar 7 días de pago
// Los dispara app/api/cron/nurture-emails, uno por día, con su propia
// columna de idempotencia cada uno (nurture_features_gratis_enviado_at /
// nurture_trial_oferta_enviado_at).
// ============================================================================

export async function sendNurtureFeaturesGratisEmail(params: {
  toEmail: string;
  toName: string | null;
  // Camino elegido en el cuestionario "Tu plan" (null si no lo hizo).
  camino?: "deudas" | "ordenar" | "probar" | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName, camino } = params;
  const saludoNombre = toName || "";
  const dashboardUrl = `${SITE_URL}/dashboard`;

  // Ángulo distinto al de la bienvenida del día 0 (25 sept 2026, pedido de
  // Joel: "el día 2 hay que enviarle un mensaje de valor explicativo de
  // algo de organizarse, metas, citas o lo que sea" — el día 0 ya cubre
  // subir el CSV/Excel, así que este correo NO lo repite. Es un check-in
  // con 3 acciones concretas de "organízate" en vez de una lista de
  // features — más práctico que el de bienvenida, con la idea de que a
  // los 2 días ya vio el dashboard pero quizás no tocó nada todavía.
  //
  // Ojo con no prometer de más (mismo ajuste que sendWelcomeGratisEmail):
  // en plan gratis no hay chat con VICTOR, así que nada de "dile a VICTOR"
  // ni "VICTOR te lo recuerda" — Citas y Documentos SÍ mandan recordatorio por
  // notificación push (el cron no distingue plan, ver
  // app/api/cron/notificaciones-push), pero eso es la app avisando, no
  // VICTOR conversando contigo.
  // 22 oct 2026 — si ya contestó el cuestionario "Tu plan" del Inicio, los 3
  // pasos siguen SU camino (deudas / ordenar / probar). Sin cuestionario: los
  // 3 pasos genéricos de siempre.
  const pasosGenericos: [string, string][] = [
    ["Pon tu primera Meta", "Crea una Meta desde el dashboard y anota cuánto quieres ahorrar — así ves tu progreso organizado, sin llevar la cuenta a mano."],
    ["Agenda algo en Citas", "Un pago pendiente, una cita médica, lo que sea — actívale las notificaciones y te llega un aviso antes de la fecha."],
    ["Guarda un documento en Documentos", "Sube una póliza, un contrato o el marbete del carro — todo en un solo lugar, con notificación antes de que venza."],
  ];
  const pasosPorCamino: Record<string, { intro: string; asunto: string; pasos: [string, string][] }> = {
    deudas: {
      intro: "Elegiste salir de deudas, y es de los mejores primeros pasos: pagar una tarjeta con interés alto rinde más que casi cualquier ahorro. Tu plan en el Inicio va así:",
      asunto: "Tu plan para salir de deudas, paso a paso",
      pasos: [
        ["Anota tu balance y tus deudas", "Toca Registra tu balance y luego la tarjeta Deuda: nombre, saldo, tasa y pago mínimo de cada una."],
        ["Junta un colchón de $500", "Con un colchón chiquito una avería no termina en la tarjeta. Toca Ahorrado y usa Aportar."],
        ["Ataca una deuda y regístralo", "Usa el botón Pagar en cada deuda: baja tu deuda y tu balance. Bola de nieve (la más pequeña primero) o avalancha (la de más interés primero), tú eliges."],
      ],
    },
    ordenar: {
      intro: "Elegiste ordenar tu dinero y hacerlo crecer. La idea es págate primero: separar de lo que cobras antes de gastar. Empieza con 10% y sube hacia 20%. Tu plan en el Inicio va así:",
      asunto: "Págate primero: tu plan para ordenar y crecer",
      pasos: [
        ["Anota tu balance y los movimientos del mes", "Registra tu balance de hoy y tus ingresos y gastos, o sube el CSV, Excel o PDF de tu banco."],
        ["Págate primero apenas cobres", "En Ahorrado o Inversiones toca Aportar. Cuenta para el 20% de tu regla 50/30/20 y se puede deshacer."],
        ["Arma tu fondo de emergencia", "La meta son 3 meses de gastos básicos. La tarjeta Tu plan te muestra cuántos meses llevas."],
      ],
    },
    probar: {
      intro: "Elegiste probar VICTOR con tus números reales. En 5 minutos puedes ver tu dinero ordenado:",
      asunto: "Prueba VICTOR con tus números reales en 5 minutos",
      pasos: [
        ["Sube el estado de cuenta de tu banco", "CSV, Excel o PDF de los últimos 2 o 3 meses. La app calcula tus ingresos y gastos."],
        ["Anota tu balance de hoy", "Así ves tu patrimonio neto: lo que tienes menos lo que debes."],
        ["Mira tu reparto 50/30/20", "Necesidades, gustos y ahorro frente a la meta, más tu flujo neto del mes."],
      ],
    },
  };
  const plan = camino ? pasosPorCamino[camino] : undefined;
  const pasos = plan ? plan.pasos : pasosGenericos;
  const introTexto = plan
    ? plan.intro
    : "¿Cómo va todo con VICTOR CFO? Si todavía no le has dado uso a tu cuenta gratis, aquí van 3 cosas rápidas para organizarte desde ya:";
  const introHtml = plan
    ? escapeHtml(plan.intro)
    : "¿Cómo va todo con VICTOR CFO? Si todavía no le has dado uso a tu cuenta <strong>gratis</strong>, aquí van 3 cosas rápidas para organizarte desde ya:";

  const textoPlano =
    (saludoNombre ? `Hola ${saludoNombre},\n\n` : `Hola,\n\n`) +
    `${introTexto}\n\n` +
    pasos.map(([titulo, texto], i) => `${i + 1}. ${titulo} — ${texto}`).join("\n\n") +
    `\n\nEntra aquí:\n${dashboardUrl}\n\n` +
    `Cualquier duda o pregunta, escríbenos a soporte@victorcfo.com y te respondemos en la brevedad posible.\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = saludoNombre ? escapeHtml(saludoNombre) : "";

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
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${htmlSeguro ? `Hola, <strong>${htmlSeguro}</strong>,` : `Hola,`}</p>
  <p>${introHtml}</p>
  <div style="margin: 24px 0;">${pasosHtml}</div>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${dashboardUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Entrar a mi cuenta</a>
  </div>
  <p style="font-size: 14px;">Cualquier duda o pregunta, escríbenos a <a href="mailto:soporte@victorcfo.com" style="color: #1D9E75;">soporte@victorcfo.com</a> y te responderemos en la brevedad posible.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: plan ? plan.asunto : "3 cosas rápidas para organizarte con VICTOR CFO",
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

export async function sendNurtureTrialOfertaEmail(params: {
  toEmail: string;
  toName: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName } = params;
  const saludoNombre = toName || "";
  // Manda directo al upgrade de Core con el trial de 7 días ya activo (ver
  // trial_period_days en app/api/stripe/checkout/route.ts) — no a /registro
  // (esa persona ya tiene cuenta) ni a completar-pago (es para quien pagó y
  // no terminó). /dashboard/config es donde ya vive el upgrade de plan.
  const upgradeUrl = `${SITE_URL}/dashboard/config?upgrade=core`;

  const beneficios: [string, string][] = [
    ["Tu banco conectado de verdad", "Nada de escribir a mano ni subir CSV — tus gastos e ingresos aparecen solos, todos los días."],
    ["VICTOR por chat, 24/7", "Pregúntale cualquier cosa de tus finanzas y te contesta al momento, con tus datos reales."],
    ["Reportes listos para Hacienda", "Cuando llegue el momento, ya tienes todo organizado — no un mes de trabajo atrasado."],
  ];

  const textoPlano =
    (saludoNombre ? `Hola ${saludoNombre},\n\n` : `Hola,\n\n`) +
    `Ya llevas unos días usando VICTOR CFO gratis — ¿qué tal si pruebas lo demás sin compromiso? 7 días gratis de Core, cancela cuando quieras:\n\n` +
    beneficios.map(([titulo, texto], i) => `${i + 1}. ${titulo} — ${texto}`).join("\n\n") +
    `\n\nActiva tu prueba aquí:\n${upgradeUrl}\n\n` +
    `Cualquier duda o pregunta, escríbenos a soporte@victorcfo.com y te respondemos en la brevedad posible.\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = saludoNombre ? escapeHtml(saludoNombre) : "";

  const beneficiosHtml = beneficios
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
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${htmlSeguro ? `Hola, <strong>${htmlSeguro}</strong>,` : `Hola,`}</p>
  <p>Ya llevas unos días usando VICTOR CFO gratis — ¿qué tal si pruebas lo demás sin compromiso? <strong>7 días gratis de Core</strong>, cancela cuando quieras.</p>
  <div style="margin: 24px 0;">${beneficiosHtml}</div>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${upgradeUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Probar 7 días gratis</a>
  </div>
  <p style="font-size: 14px;">Cualquier duda o pregunta, escríbenos a <a href="mailto:soporte@victorcfo.com" style="color: #1D9E75;">soporte@victorcfo.com</a> y te responderemos en la brevedad posible.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "7 días gratis para probar todo VICTOR CFO",
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// #792 (1 oct 2026, pedido de Joel: "la fiscalización ya es algorítmica")
// — 3er correo de la secuencia de nurture para plan='gratis', día 8 desde
// el registro (después de día 2 features / día 5 trial). Ángulo distinto
// a los otros dos: no es "mira lo que puedes hacer", es la urgencia real
// de organizarse — Hacienda cruza datos del IRS (incluida la 1099-K que
// reportan Stripe/ATH/procesadores de pago) contra lo que el contribuyente
// radicó, y lo ha hecho públicamente miles de veces. Mismos 3 datos/fuente
// que la sección #fiscalizacion-algoritmica de landing-page.tsx
// (comunicados de prensa reales de hacienda.pr.gov, verificados por web
// search el 1 oct 2026 — la pieza original pedía citar "SC 2915" pero ese
// formulario es la Planilla Mensual de IVU, no tiene nada que ver con esto).
export async function sendNurtureFiscalizacionEmail(params: {
  toEmail: string;
  toName: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName } = params;
  const saludoNombre = toName || "";
  const upgradeUrl = `${SITE_URL}/dashboard/config?upgrade=core`;

  const datos: [string, string][] = [
    ["7,500 notificaciones (2022)", "a comerciantes e individuos no registrados, o con ingresos que Hacienda ya tenía registrados y no se reportaron."],
    ["1,600 notificaciones (2022)", "por correo, a personas con ingresos de Formulario 1099 del IRS que nunca radicaron planilla ese año."],
    ["$191 millones (2020)", "en ingresos no reportados por 4,440 contribuyentes — que Hacienda sí tenía, vía el intercambio de información con el IRS."],
  ];

  const textoPlano =
    (saludoNombre ? `Hola ${saludoNombre},\n\n` : `Hola,\n\n`) +
    `Cada vez que te pagan con Stripe, ATH Móvil Business o cualquier procesador de tarjetas, ese ingreso se reporta ` +
    `al IRS — y Hacienda de Puerto Rico ya tiene acceso a esa información. No hace falta que nadie te audite a mano: ` +
    `el sistema compara lo que recibiste contra lo que radicaste, automáticamente. Esto no es una amenaza genérica — son ` +
    `comunicados de prensa reales del Departamento de Hacienda:\n\n` +
    datos.map(([titulo, texto]) => `• ${titulo} — ${texto}`).join("\n\n") +
    `\n\nEl momento de organizarte es ahora, antes de la notificación — no después. Con VICTOR CFO tu banco está ` +
    `conectado de verdad, cada transacción categorizada, y tus reportes listos para tu CPA en cualquier momento. ` +
    `Prueba 7 días gratis de Core:\n${upgradeUrl}\n\n` +
    `Cualquier duda o pregunta, escríbenos a soporte@victorcfo.com y te respondemos en la brevedad posible.\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = saludoNombre ? escapeHtml(saludoNombre) : "";

  const datosHtml = datos
    .map(
      ([titulo, texto]) => `
  <div style="margin-bottom: 18px; padding: 14px 16px; background: #fafafa; border-left: 3px solid #1D9E75; border-radius: 4px;">
    <p style="margin: 0 0 4px 0; font-weight: 700; color: #14543d;">${escapeHtml(titulo)}</p>
    <p style="margin: 0; color: #555; font-size: 13.5px;">${escapeHtml(texto)}</p>
  </div>`
    )
    .join("");

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${htmlSeguro ? `Hola, <strong>${htmlSeguro}</strong>,` : `Hola,`}</p>
  <p>Cada vez que te pagan con Stripe, ATH Móvil Business o cualquier procesador de tarjetas, ese ingreso se reporta al IRS — y Hacienda de Puerto Rico ya tiene acceso a esa información. El sistema compara lo que recibiste contra lo que radicaste, <strong>automáticamente</strong>. No es una amenaza genérica — son comunicados de prensa reales:</p>
  <div style="margin: 24px 0;">${datosHtml}</div>
  <p>El momento de organizarte es ahora, antes de la notificación — no después. Con VICTOR CFO tu banco está conectado de verdad, cada transacción categorizada, y tus reportes listos para tu CPA en cualquier momento.</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${upgradeUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Probar 7 días gratis</a>
  </div>
  <p style="font-size: 14px;">Cualquier duda o pregunta, escríbenos a <a href="mailto:soporte@victorcfo.com" style="color: #1D9E75;">soporte@victorcfo.com</a> y te responderemos en la brevedad posible.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "Hacienda ya cruza tus datos — ¿tus números están listos?",
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// ============================================================================
// Nurture v2 (6 oct 2026, migración 0141, pedido de Joel): correo guía de
// CSV/Excel (día 3) + tips semanales de VICTOR (estilo blog, desde día 14).
// Ambos llevan link de baja (lib/email-baja.ts) en el pie.
// ============================================================================
function envolverCorreoNurture(params: { saludo: string; cuerpoHtml: string; ctaTexto: string; ctaUrl: string; bajaUrl: string }): string {
  const { saludo, cuerpoHtml, ctaTexto, ctaUrl, bajaUrl } = params;
  return `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${saludo ? `Hola, <strong>${escapeHtml(saludo)}</strong>,` : `Hola,`}</p>
  ${cuerpoHtml}
  <div style="text-align: center; margin: 28px 0;">
    <a href="${ctaUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">${escapeHtml(ctaTexto)}</a>
  </div>
  <p style="font-size: 14px;">Cualquier duda o pregunta, escríbenos a <a href="mailto:soporte@victorcfo.com" style="color: #1D9E75;">soporte@victorcfo.com</a>.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a><br/><a href="${bajaUrl}" style="color: #999;">Dejar de recibir estos correos</a></p>
</div>`.trim();
}

export async function sendNurtureCsvGuiaEmail(params: {
  toEmail: string;
  toName: string | null;
  userId: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };

  const { toEmail, toName, userId } = params;
  const cuentasUrl = `${SITE_URL}/dashboard/cuentas`;
  const bajaUrl = urlBajaCorreos(SITE_URL, userId);

  const pasos: [string, string][] = [
    ["Elige tu camino", "Si subes el CSV, Excel o PDF de tu banco desde Cuentas, VICTOR calcula todo por ti: ingresos, gastos y balance. Si prefieres anotar a mano, sigue los pasos de abajo."],
    ["Si anotas a mano: primero tu balance de hoy", "En Inicio, toca \"Anotar mi balance\" y escribe cuánto tienes ese día. Anota todos tus ingresos y gastos a partir de esa fecha; sin el balance de partida, el cálculo arranca en cero y se va en negativo."],
    ["Toca una tarjeta y registra", "Ingresos: monto, fecha y de dónde vino. Gastos: monto, fecha y categoría. Ahorrado e Inversiones: tu saldo actual. ¿Te equivocaste? Entra a Transacciones, edita o borra y tu balance se corrige solo."],
  ];

  const textoPlano =
    (toName ? `Hola ${toName},\n\n` : `Hola,\n\n`) +
    `¿Ya viste tu dashboard con tus números reales? Te toma 5 minutos y es lo que más vale la pena hacer en tu cuenta gratis:\n\n` +
    pasos.map(([t, x], i) => `${i + 1}. ${t} — ${x}`).join("\n\n") +
    `\n\nEmpieza aquí:\n${SITE_URL}/dashboard\n\n` +
    `Si tu banco solo da PDF, también lo puedes subir desde Cuentas: ${cuentasUrl}\n\n— VICTOR CFO\nUn producto de West Capital Ventures LLC · ${SITE_URL}\n\nDejar de recibir estos correos: ${bajaUrl}`;

  const pasosHtml = pasos
    .map(
      ([t, x], i) => `
  <div style="display: flex; gap: 14px; margin-bottom: 20px;">
    <div style="flex-shrink: 0; width: 28px; height: 28px; border-radius: 9999px; background: #eefaf4; color: #14543d; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center;">${i + 1}</div>
    <div>
      <p style="margin: 0 0 4px 0; font-weight: 600;">${escapeHtml(t)}</p>
      <p style="margin: 0; color: #555; font-size: 14px;">${escapeHtml(x)}</p>
    </div>
  </div>`
    )
    .join("");

  const html = envolverCorreoNurture({
    saludo: toName || "",
    cuerpoHtml: `<p>¿Ya viste tu dashboard con tus <strong>números reales</strong>? Te toma unos 5 minutos y es lo que más vale la pena hacer en tu cuenta gratis:</p>
  <div style="margin: 24px 0;">${pasosHtml}</div>
  <p style="font-size: 14px; color: #555;">Si tu banco solo da PDF, también lo puedes subir desde <a href="${cuentasUrl}" style="color: #1D9E75;">Cuentas</a>.</p>`,
    ctaTexto: "Registrar mis finanzas",
    ctaUrl: `${SITE_URL}/dashboard`,
    bajaUrl,
  });

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "Registra tu día en 1 minuto y ve tu balance al instante",
      text: textoPlano,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

export async function sendNurtureTipEmail(params: {
  toEmail: string;
  toName: string | null;
  userId: string;
  tip: TipVictor;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };

  const { toEmail, toName, userId, tip } = params;
  const bajaUrl = urlBajaCorreos(SITE_URL, userId);
  const ctaUrl = `${SITE_URL}${tip.accion?.path ?? "/dashboard"}`;
  const ctaTexto = tip.accion?.texto ?? "Abrir mi cuenta";
  const upgradeUrl = `${SITE_URL}/dashboard/config?upgrade=core`;

  const textoPlano =
    (toName ? `Hola ${toName},\n\n` : `Hola,\n\n`) +
    `${tip.titulo}\n\n` +
    tip.parrafos.join("\n\n") +
    `\n\n${ctaTexto}: ${ctaUrl}\n\n` +
    `Cuando quieras que VICTOR haga esto por ti, con tu banco conectado y chat 24/7, prueba Core 7 días gratis: ${upgradeUrl}\n\n` +
    `— VICTOR CFO\nUn producto de West Capital Ventures LLC · ${SITE_URL}\n\nDejar de recibir estos correos: ${bajaUrl}`;

  const html = envolverCorreoNurture({
    saludo: toName || "",
    cuerpoHtml: `<h2 style="font-size: 20px; margin: 16px 0 12px 0;">${escapeHtml(tip.titulo)}</h2>
  ${tip.parrafos.map((p) => `<p style="color: #333;">${escapeHtml(p)}</p>`).join("\n  ")}
  <p style="font-size: 13.5px; color: #555; background: #fafafa; border-left: 3px solid #1D9E75; padding: 10px 14px; border-radius: 4px; margin-top: 22px;">¿Quieres que VICTOR lo haga por ti, con tu banco conectado y chat 24/7? <a href="${upgradeUrl}" style="color: #1D9E75; font-weight: 600;">Prueba Core 7 días gratis</a>.</p>`,
    ctaTexto,
    ctaUrl,
    bajaUrl,
  });

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: tip.asunto,
      text: textoPlano,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Aviso al cliente cuando su firma lo libera del plan wholesale (6 oct 2026):
// conserva Business y sus datos durante la gracia; si no asume su plan, baja
// a gratis (nunca se borra nada).
export async function sendFirmaClienteLiberadoEmail(params: {
  clienteEmail: string;
  clienteNombre: string | null;
  firmaNombre: string | null;
  graciaHasta: string;
  dias: number;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };

  const { clienteEmail, clienteNombre, firmaNombre, graciaHasta, dias } = params;
  const firma = firmaNombre || "tu contador";
  const fecha = new Date(graciaHasta).toLocaleDateString("es-PR", { day: "numeric", month: "long", year: "numeric" });
  const url = `${SITE_URL}/dashboard/config`;

  const texto =
    (clienteNombre ? `Hola ${clienteNombre},\n\n` : `Hola,\n\n`) +
    `${firma} ya no incluye tu plan Business de VICTOR CFO. Tu cuenta y todos tus datos siguen intactos, y conservas el plan Business ${dias} días más, hasta el ${fecha}.\n\n` +
    `Para continuar sin interrupciones, activa tu propio plan aquí:\n${url}\n\n` +
    `Si no lo haces, tu cuenta pasa al plan gratis — no se borra nada.\n\n— VICTOR CFO\nUn producto de West Capital Ventures LLC · ${SITE_URL}`;

  const html = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${clienteNombre ? `Hola, <strong>${escapeHtml(clienteNombre)}</strong>,` : `Hola,`}</p>
  <p><strong>${escapeHtml(firma)}</strong> ya no incluye tu plan Business de VICTOR CFO. Tu cuenta y todos tus datos siguen intactos, y conservas el plan Business <strong>${dias} días más, hasta el ${escapeHtml(fecha)}</strong>.</p>
  <p>Para continuar sin interrupciones, activa tu propio plan:</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${url}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Continuar con mi plan</a>
  </div>
  <p style="font-size: 14px; color: #555;">Si no lo haces, tu cuenta pasa al plan gratis — no se borra nada.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: clienteEmail,
      subject: `Tu plan Business de VICTOR CFO — ${dias} días para continuar`,
      text: texto,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Recordatorio semanal de gracia (6 oct 2026, pedido de Joel: "hay que
// enviarle email semanal, pq la idea es que no se pierda y menos si tiene
// addon activo"). Lo manda el cron firma-gracia cada 7 días a un cliente que
// su firma liberó y todavía no contrató su propio plan. Si tiene addons
// activos se le dice cuáles perdería al pasar a gratis.
export async function sendFirmaGraciaRecordatorioEmail(params: {
  clienteEmail: string;
  clienteNombre: string | null;
  firmaNombre: string | null;
  graciaHasta: string;
  diasRestantes: number;
  addons: string[];
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };

  const { clienteEmail, clienteNombre, firmaNombre, graciaHasta, diasRestantes, addons } = params;
  const firma = firmaNombre || "tu contador";
  const fecha = new Date(graciaHasta).toLocaleDateString("es-PR", { day: "numeric", month: "long", year: "numeric" });
  const url = `${SITE_URL}/dashboard/config`;
  const diasTxt = diasRestantes <= 1 ? "mañana" : `en ${diasRestantes} días`;
  const addonsTxt = addons.length > 0 ? addons.join(", ") : "";

  const textoAddons = addonsTxt
    ? `Tienes activos estos addons: ${addonsTxt}. Si tu cuenta pasa al plan gratis, dejarán de funcionar.\n\n`
    : "";
  const texto =
    (clienteNombre ? `Hola ${clienteNombre},\n\n` : `Hola,\n\n`) +
    `Te recordamos que ${firma} ya no incluye tu plan Business de VICTOR CFO. Tu plan vence ${diasTxt} (${fecha}).\n\n` +
    textoAddons +
    `Para no perder el acceso a tu plan Business, actívalo aquí:\n${url}\n\n` +
    `Tus datos no se borran, pero sin plan pagado tu cuenta pasa al plan gratis.\n\n— VICTOR CFO\nUn producto de West Capital Ventures LLC · ${SITE_URL}`;

  const bloqueAddons = addonsTxt
    ? `<p style="background:#fff7e6;border:1px solid #f0c36d;border-radius:8px;padding:10px 12px;font-size:14px;">Tienes activos estos addons: <strong>${escapeHtml(addonsTxt)}</strong>. Si tu cuenta pasa al plan gratis, dejarán de funcionar.</p>`
    : "";

  const html = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${clienteNombre ? `Hola, <strong>${escapeHtml(clienteNombre)}</strong>,` : `Hola,`}</p>
  <p>Te recordamos que <strong>${escapeHtml(firma)}</strong> ya no incluye tu plan Business. Tu plan vence <strong>${diasTxt}</strong> (${escapeHtml(fecha)}).</p>
  ${bloqueAddons}
  <div style="text-align: center; margin: 28px 0;">
    <a href="${url}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Mantener mi plan Business</a>
  </div>
  <p style="font-size: 14px; color: #555;">Tus datos no se borran, pero sin plan pagado tu cuenta pasa al plan gratis.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: clienteEmail,
      subject: `Tu plan Business vence ${diasTxt} — no pierdas tu cuenta`,
      text: texto,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Correo automático al CANCELAR (27 sept 2026, pedido de Joel: "que de
// manera automatica como el email de bienvenida se le envia uno si
// cancelan haciendo unas preguntas para saber la razon y ofrecerle alguna
// recompenza a ver si vuelve o contestar alguna duda o miedo que lo
// motivo a cancelar"). Se dispara desde el webhook de Stripe
// (customer.subscription.deleted) — mismo patrón que sendWelcomeEmail: si
// falla el envío no tumba el webhook, la cancelación ya quedó registrada.
//
// Ajustado el mismo día (feedback de Joel: "no comprendo la parte que
// dice léelo una persona real... debe ser algo como que opciones que
// pueda marcar y enviar y una caja de comentario") — la razón ya NO se
// pide por reply de correo (confuso: sonaba a encuesta pero pedía texto
// libre). Ahora el botón lleva a /encuesta-cancelacion, una página real
// con checkboxes (mismas 8 razones que ya usa el Cancellation Flow de
// Stripe / RAZON_CANCELACION_LABEL en el Dashboard de Operaciones) más
// una caja de comentario libre. El reply-to a soporte@victorcfo.com se
// mantiene aparte, para dudas o preocupaciones sueltas — no para la razón
// formal de cancelación.
//
// Tres cosas en un solo correo:
//   1. Botón a la encuesta real (checkboxes + comentario) vía
//      encuestaToken de un solo uso — no expone el user id.
//   2. La recompensa es un código de promoción real de Stripe
//      (promoCode), generado por el webhook al momento de cancelar,
//      restringido a este customer, válido por diasValidez días — no una
//      promesa vacía. Si por lo que sea no se pudo crear (ej. Stripe
//      caído), promoCode viene null y esa sección simplemente no sale.
//   3. Invita a resolver cualquier duda/miedo antes de irse del todo —
//      reply directo a soporte@victorcfo.com, mismo buzón de siempre.
export async function sendCancellationWinbackEmail(params: {
  toEmail: string;
  toName: string | null;
  plan: "core" | "pro" | "proplus";
  promoCode: string | null;
  diasValidez: number;
  encuestaToken: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName, plan, promoCode, diasValidez, encuestaToken } = params;
  const saludoNombre = toName || "";
  const nombrePlan = plan === "pro" || plan === "proplus" ? "Pro" : "Core";
  const reactivarUrl = `${SITE_URL}/login`;
  const encuestaUrl = encuestaToken ? `${SITE_URL}/encuesta-cancelacion?t=${encuestaToken}` : null;

  const parrafoRecompensa = promoCode
    ? `Si quieres darle otra oportunidad, tienes ${diasValidez} días para volver con un mes de ${nombrePlan} completamente gratis — usa el código ${promoCode} al reactivar tu cuenta.`
    : `Si quieres darle otra oportunidad, escríbenos y vemos qué podemos hacer para que vuelvas.`;

  const textoPlano =
    (saludoNombre ? `Hola ${saludoNombre},\n\n` : `Hola,\n\n`) +
    `Vimos que cancelaste tu cuenta de VICTOR CFO ${nombrePlan}. Antes que nada, gracias por haberlo probado.\n\n` +
    (encuestaUrl
      ? `¿Nos cuentas qué pasó? Es una pregunta de 30 segundos, marca lo que aplique:\n${encuestaUrl}\n\n`
      : "") +
    `${parrafoRecompensa}\n\n` +
    (promoCode ? `Entra aquí para reactivar:\n${reactivarUrl}\n\n` : "") +
    `Y si hay alguna duda o algo que te preocupaba de la app, responde este correo — con gusto te la resolvemos.\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = saludoNombre ? escapeHtml(saludoNombre) : "";

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${htmlSeguro ? `Hola, <strong>${htmlSeguro}</strong>,` : `Hola,`}</p>
  <p>Vimos que cancelaste tu cuenta de VICTOR CFO ${nombrePlan}. Antes que nada, gracias por haberlo probado.</p>
  ${
    encuestaUrl
      ? `<p>¿Nos cuentas qué pasó? Es una pregunta de 30 segundos, marca lo que aplique:</p>
  <div style="text-align: center; margin: 20px 0 28px;">
    <a href="${encuestaUrl}" style="background: #fff; color: #1D9E75; border: 2px solid #1D9E75; padding: 10px 26px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Contarles qué pasó</a>
  </div>`
      : ""
  }
  ${
    promoCode
      ? `<div style="background: #eefaf4; border-radius: 10px; padding: 16px 18px; margin-bottom: 24px;">
    <p style="margin: 0 0 8px 0; font-weight: 600;">Si quieres darle otra oportunidad</p>
    <p style="margin: 0; font-size: 14px; color: #14543d;">Tienes <strong>${diasValidez} días</strong> para volver con <strong>un mes de ${nombrePlan} completamente gratis</strong> — usa el código <strong style="font-family: monospace; background: #d9f2e6; padding: 2px 6px; border-radius: 4px;">${escapeHtml(promoCode)}</strong> al reactivar.</p>
  </div>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${reactivarUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Reactivar mi cuenta</a>
  </div>`
      : `<p style="font-size: 14px;">Si quieres darle otra oportunidad, escríbenos y vemos qué podemos hacer para que vuelvas.</p>`
  }
  <p style="font-size: 14px;">Y si hay alguna duda o algo que te preocupaba de la app, responde este correo — con gusto te la resolvemos.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      replyTo: "soporte@victorcfo.com",
      subject: `${saludoNombre ? saludoNombre + ", " : ""}¿qué pasó? (y un mes gratis si quieres volver)`,
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Correo manual de soporte, escrito y enviado por Joel desde el Dashboard
// de Operaciones (27 sept 2026, pedido de Joel: el botón "Email" de
// Cancelados recientes usaba un link mailto, que abre el cliente de
// correo del navegador y sale con SU dirección personal, no
// soporte@victorcfo.com — "no me gusta"). Esta función sí manda el correo
// de verdad, desde el servidor, con remitente soporte@victorcfo.com fijo
// (victorcfo.com ya está verificado en Resend), sin depender de qué
// cliente de correo tenga configurado Joel en su computadora.
const FROM_SOPORTE = "VICTOR CFO <soporte@victorcfo.com>";

export async function sendMensajeSoporteManual(params: {
  toEmail: string;
  asunto: string;
  mensaje: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, asunto, mensaje } = params;
  const mensajeSeguro = escapeHtml(mensaje).replace(/\n/g, "<br/>");

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${mensajeSeguro}</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM_SOPORTE,
      to: toEmail,
      replyTo: "soporte@victorcfo.com",
      subject: asunto,
      text: mensaje,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Aviso de pago fallido (28 sept 2026) — caso real: Eduardo Rosario Amador
// tomó el trial de 7 días de Pro, hizo el onboarding completo, y al
// terminar el trial Stripe intentó cobrar de verdad y la tarjeta falló por
// fondos insuficientes. El webhook (customer.subscription.updated) baja la
// cuenta a plan_status='incomplete' correctamente, pero hasta ahora nadie
// le avisaba — se quedaba fuera del dashboard sin saber por qué. Este
// correo cierra ese hueco: portalUrl es una sesión de Stripe Billing Portal
// ya generada (el usuario puede actualizar su tarjeta y reintentar el cobro
// ahí mismo, sin tener que iniciar sesión en VICTOR CFO primero).
export async function sendPaymentFailedEmail(params: {
  toEmail: string;
  toName: string | null;
  portalUrl: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName, portalUrl } = params;
  const saludoNombre = toName || "";

  const textoPlano =
    (saludoNombre ? `Hola ${saludoNombre},\n\n` : `Hola,\n\n`) +
    `Intentamos cobrar tu suscripción de VICTOR CFO y el pago no pasó — normalmente es algo simple, como fondos insuficientes o una tarjeta vencida. Mientras esto no se resuelva, tu cuenta queda sin acceso al dashboard.\n\n` +
    `Actualiza tu método de pago aquí (es la página segura de Stripe, no pedimos tu tarjeta por correo):\n\n` +
    `${portalUrl}\n\n` +
    `En cuanto el pago pase, tu cuenta se reactiva sola — no hace falta que hagas nada más.\n\n` +
    `Cualquier duda, escríbenos a soporte@victorcfo.com.\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = saludoNombre ? escapeHtml(saludoNombre) : "";

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${htmlSeguro ? `Hola, <strong>${htmlSeguro}</strong>,` : `Hola,`}</p>
  <p>Intentamos cobrar tu suscripción de VICTOR CFO y el pago no pasó — normalmente es algo simple, como fondos insuficientes o una tarjeta vencida. Mientras esto no se resuelva, tu cuenta queda sin acceso al dashboard.</p>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${portalUrl}" style="background: #1D9E75; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Actualizar método de pago</a>
  </div>
  <p style="font-size: 14px;">Es la página segura de Stripe — no pedimos tu tarjeta por correo. En cuanto el pago pase, tu cuenta se reactiva sola, no hace falta que hagas nada más.</p>
  <p style="font-size: 14px;">Cualquier duda, escríbenos a <a href="mailto:soporte@victorcfo.com" style="color: #1D9E75;">soporte@victorcfo.com</a>.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "Tu pago no pasó — actualiza tu tarjeta",
      text: textoPlano,
      html: htmlCorreo,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Aprobación de socio (Programa de Socios, migración 0070/0106, 29 sept
// 2026, pedido de Joel: "que el vendedor reciba su link/QR
// automáticamente al aprobarlo"). Aplica a los 4 tipos (cpa/influencer/
// otro/vendedor) — todos comparten el mismo mecanismo de código corto y
// /registro?socio=CODIGO, así que todos se benefician de tener su QR
// listo para imprimir o mostrar en el celular, no solo los vendedores.
//
// El QR se genera aquí mismo con la librería `qrcode` (server-side, PNG) y
// se manda como ADJUNTO del correo — no como <img> inline en el HTML,
// porque muchos clientes de correo (Gmail incluido) bloquean o no
// renderizan imágenes en data: URL de forma confiable. Como adjunto,
// siempre llega y el socio lo puede abrir/guardar/imprimir directo desde
// el correo. El link y el código también van en texto plano en el cuerpo,
// por si el socio prefiere copiarlo a mano en vez de usar el QR.
export async function sendSocioAprobadoEmail(params: {
  toEmail: string;
  toName: string | null;
  codigo: string;
  // PIN del portal del vendedor (migración 0107, 29 sept 2026) — solo
  // viene presente cuando el socio es tipo='vendedor' Y este correo se
  // dispara justo cuando se le generó el PIN por primera vez (ver
  // app/api/socios/[id]/route.ts). Un embajador (cpa/influencer/otro)
  // nunca lo recibe porque nunca tiene portal.
  pin?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { toEmail, toName, codigo, pin } = params;
  const saludoNombre = toName || "";
  const link = `${SITE_URL}/registro?socio=${codigo}`;
  const linkPortal = `${SITE_URL}/socios/portal`;

  let qrBase64: string | null = null;
  try {
    const qrBuffer = await QRCode.toBuffer(link, { width: 480, margin: 2 });
    qrBase64 = qrBuffer.toString("base64");
  } catch (err) {
    // Si por lo que sea falla la generación del QR, el correo sale igual
    // con el link en texto — no vale la pena tumbar el aviso por esto.
    console.error("No se pudo generar el QR del socio:", err);
  }

  const textoPlano =
    (saludoNombre ? `Hola ${saludoNombre},\n\n` : `Hola,\n\n`) +
    `¡Ya estás aprobado en VICTOR CFO! Tu código es ${codigo}.\n\n` +
    `Este es tu link personal para compartir — cualquier negocio que se registre por aquí queda ` +
    `conectado a ti automáticamente, sin que tengas que avisarle a nadie:\n\n` +
    `${link}\n\n` +
    `Te adjuntamos también tu código QR (mismo link) — guárdalo en el celular o imprímelo para ` +
    `enseñárselo en persona a un negocio que quiera registrarse ahí mismo.\n\n` +
    (pin
      ? `Tu portal de vendedor — ahí ves tus clientes, tu comisión cobrada y pendiente:\n` +
        `${linkPortal}\n` +
        `Código: ${codigo}\n` +
        `PIN: ${pin}\n\n`
      : "") +
    `Cualquier duda, contáctanos directamente.\n\n` +
    `— VICTOR CFO\n` +
    `Un producto de West Capital Ventures LLC · ${SITE_URL}`;

  const htmlSeguro = saludoNombre ? escapeHtml(saludoNombre) : "";

  const htmlCorreo = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p>${htmlSeguro ? `Hola, <strong>${htmlSeguro}</strong>,` : `Hola,`}</p>
  <p>¡Ya estás aprobado! Este es tu link personal — cualquier negocio que se registre por aquí queda conectado a ti automáticamente.</p>
  <div style="text-align: center; margin: 24px 0;">
    <div style="display: inline-block; background: #eefaf4; border: 1px solid #1D9E75; border-radius: 12px; padding: 14px 24px;">
      <div style="font-size: 12px; color: #14543d;">Tu código</div>
      <div style="font-size: 22px; font-weight: 700; color: #14543d; font-family: monospace;">${escapeHtml(codigo)}</div>
    </div>
  </div>
  <div style="text-align: center; margin: 20px 0; word-break: break-all;">
    <a href="${link}" style="color: #1D9E75; font-size: 14px;">${link}</a>
  </div>
  ${
    qrBase64
      ? `<p style="font-size: 13px; text-align: center; color: #666;">Te adjuntamos tu código QR (mismo link) — guárdalo o imprímelo para enseñárselo en persona a un negocio que quiera registrarse ahí mismo.</p>`
      : ""
  }
  ${
    pin
      ? `<div style="text-align: center; margin: 24px 0;">
    <p style="font-size: 13px; margin-bottom: 8px;">Tu portal de vendedor — ahí ves tus clientes y tu comisión:</p>
    <a href="${linkPortal}" style="color: #1D9E75; font-size: 14px;">${linkPortal}</a>
    <div style="display: inline-block; margin-top: 10px; background: #eefaf4; border: 1px solid #1D9E75; border-radius: 12px; padding: 10px 20px;">
      <div style="font-size: 12px; color: #14543d;">PIN</div>
      <div style="font-size: 20px; font-weight: 700; color: #14543d; font-family: monospace;">${escapeHtml(pin)}</div>
    </div>
  </div>`
      : ""
  }
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: "Ya estás aprobado — tu link y tu QR de VICTOR CFO",
      text: textoPlano,
      html: htmlCorreo,
      ...(qrBase64
        ? { attachments: [{ filename: `qr-${codigo}.png`, content: qrBase64 }] }
        : {}),
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// ---------------------------------------------------------------------------
// Solicitud de socio / vendedor (13 oct 2026, pedido de Joel): flujo
//   1) candidato envía solicitud + currículum en /socios
//      → sendSocioSolicitudRecibidaEmail (próximos pasos) y
//        sendSocioNuevaSolicitudAJoelEmail (aviso a info@victorcfo.com)
//   2) el equipo revisa y aprueba en Ventas
//      → sendSocioDocumentosEmail (link privado para completar contrato +
//        datos de pago)
//   3) al completar los documentos se manda el correo con código/PIN/QR
//      (sendSocioAprobadoEmail, más arriba).
// ---------------------------------------------------------------------------
function envolverCorreoSocio(cuerpoHtml: string): string {
  return `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 24px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  ${cuerpoHtml}
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();
}

export async function sendSocioSolicitudRecibidaEmail(params: {
  toEmail: string;
  toName: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  const { toEmail, toName } = params;
  const saludo = toName ? `Hola ${toName},` : "Hola,";

  const texto =
    `${saludo}\n\n` +
    `Recibimos tu solicitud para unirte al equipo de VICTOR CFO. Gracias por tu interés.\n\n` +
    `Qué sigue:\n` +
    `1. El equipo de VICTOR CFO revisa tu solicitud y tu currículum.\n` +
    `2. Si tu perfil es aprobado, te avisaremos por correo y por WhatsApp.\n` +
    `3. Ahí completarás tus documentos (contrato y datos de pago) desde un link privado.\n` +
    `4. Al terminar, recibirás tu código, tu QR y el acceso a tu portal de vendedor.\n\n` +
    `No tienes que hacer nada más por ahora. Si tienes dudas, responde a este correo.\n\n` +
    `— VICTOR CFO\nUn producto de West Capital Ventures LLC · ${SITE_URL}`;

  const html = envolverCorreoSocio(`
  <p>${toName ? `Hola, <strong>${escapeHtml(toName)}</strong>,` : "Hola,"}</p>
  <p>Recibimos tu solicitud para unirte al equipo de VICTOR CFO. Gracias por tu interés.</p>
  <p style="margin-bottom: 4px;"><strong>Qué sigue</strong></p>
  <ol style="padding-left: 20px; margin-top: 4px; font-size: 14px;">
    <li>El equipo de VICTOR CFO revisa tu solicitud y tu currículum.</li>
    <li>Si tu perfil es aprobado, te avisamos por correo y por WhatsApp.</li>
    <li>Ahí completas tus documentos (contrato y datos de pago) desde un link privado.</li>
    <li>Al terminar, recibes tu código, tu QR y el acceso a tu portal de vendedor.</li>
  </ol>
  <p style="font-size: 13px; color: #666;">No tienes que hacer nada más por ahora. Si tienes dudas, responde a este correo.</p>`);

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      replyTo: "info@victorcfo.com",
      subject: "Recibimos tu solicitud — VICTOR CFO",
      text: texto,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

export async function sendSocioNuevaSolicitudAJoelEmail(params: {
  nombre: string;
  email: string;
  telefono: string | null;
  tipo: string;
  comoPromociona: string | null;
  tieneResume: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  const { nombre, email, telefono, tipo, comoPromociona, tieneResume } = params;

  const texto =
    `Nueva solicitud al Programa de Socios.\n\n` +
    `Nombre: ${nombre}\nEmail: ${email}\nTeléfono: ${telefono ?? "—"}\nTipo: ${tipo}\n` +
    `Currículum: ${tieneResume ? "adjunto (verlo en Ventas)" : "no subió"}\n\n` +
    `Cómo planea promocionar:\n${comoPromociona ?? "—"}\n\n` +
    `Revísala en ${SITE_URL}/dashboard/ventas`;

  const html = envolverCorreoSocio(`
  <p style="font-size: 14px;"><strong>Nueva solicitud al Programa de Socios</strong></p>
  <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
    <tr><td style="padding: 3px 0; color: #999; width: 90px;">Nombre</td><td>${escapeHtml(nombre)}</td></tr>
    <tr><td style="padding: 3px 0; color: #999;">Email</td><td>${escapeHtml(email)}</td></tr>
    <tr><td style="padding: 3px 0; color: #999;">Teléfono</td><td>${escapeHtml(telefono ?? "—")}</td></tr>
    <tr><td style="padding: 3px 0; color: #999;">Tipo</td><td>${escapeHtml(tipo)}</td></tr>
    <tr><td style="padding: 3px 0; color: #999;">Currículum</td><td>${tieneResume ? "Adjunto (verlo en Ventas)" : "No subió"}</td></tr>
  </table>
  <div style="background: #f7f7f7; border-radius: 8px; padding: 12px; font-size: 13px; white-space: pre-wrap; margin: 12px 0;">${escapeHtml(comoPromociona ?? "—")}</div>
  <p style="text-align: center;"><a href="${SITE_URL}/dashboard/ventas" style="color: #1D9E75;">Revisar en Ventas</a></p>`);

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: "info@victorcfo.com",
      replyTo: email,
      subject: `[Nueva solicitud de socio] ${nombre}`,
      text: texto,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Aprobación → pide completar documentos (contrato + datos de pago). El
// código, el QR y el PIN se mandan DESPUÉS, al completar (ver
// app/api/socios/pago/[token]/route.ts).
export async function sendSocioDocumentosEmail(params: {
  toEmail: string;
  toName: string | null;
  token: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  const { toEmail, toName, token } = params;
  const link = `${SITE_URL}/socios/pago/${token}`;
  const saludo = toName ? `Hola ${toName},` : "Hola,";

  const texto =
    `${saludo}\n\n` +
    `¡Buenas noticias! Tu solicitud fue aprobada por el equipo de VICTOR CFO.\n\n` +
    `Último paso: completa tus documentos en este link privado (toma unos 5 minutos):\n${link}\n\n` +
    `Ahí vas a:\n` +
    `1. Leer y aceptar el Contrato de Servicios Independientes.\n` +
    `2. Dar tus datos de contratista (nombre legal, SSN o EIN y dirección).\n` +
    `3. Dar los datos de tu cuenta bancaria para pagarte tus comisiones por ACH.\n\n` +
    `Cuando termines te enviaremos tu código personal, tu QR y el acceso a tu portal de vendedor.\n\n` +
    `— VICTOR CFO\nUn producto de West Capital Ventures LLC · ${SITE_URL}`;

  const html = envolverCorreoSocio(`
  <p>${toName ? `Hola, <strong>${escapeHtml(toName)}</strong>,` : "Hola,"}</p>
  <p>¡Buenas noticias! Tu solicitud fue aprobada por el equipo de VICTOR CFO.</p>
  <p>Último paso: completa tus documentos en tu link privado (toma unos 5 minutos).</p>
  <p style="text-align: center; margin: 24px 0;"><a href="${link}" style="background: #1D9E75; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 9999px; font-size: 14px; font-weight: 600; display: inline-block;">Completar mis documentos</a></p>
  <ol style="padding-left: 20px; font-size: 14px;">
    <li>Leer y aceptar el Contrato de Servicios Independientes.</li>
    <li>Dar tus datos de contratista (nombre legal, SSN o EIN y dirección).</li>
    <li>Dar los datos de tu cuenta bancaria para pagarte tus comisiones por ACH.</li>
  </ol>
  <p style="font-size: 13px; color: #666;">Cuando termines te enviamos tu código personal, tu QR y el acceso a tu portal de vendedor.</p>`);

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      replyTo: "info@victorcfo.com",
      subject: "Fuiste aprobado — completa tus documentos de VICTOR CFO",
      text: texto,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}


// 16 oct 2026: envía al contratista su Modelo 480.6SP (PDF de una página).
export async function sendFormulario480Email(params: {
  toEmail: string;
  nombre: string;
  remitente: string;
  anio: number;
  pdf: Buffer;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  const nombre = escapeHtml(params.nombre);
  const rem = escapeHtml(params.remitente);
  const html = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <p>Hola ${nombre},</p>
  <p><strong>${rem}</strong> te envía adjunto tu Modelo 480.6SP del año ${params.anio} (comprobante de pagos y retenciones). Guárdalo para tu planilla.</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
  <p style="font-size: 12px; color: #999;">Enviado con VICTOR CFO · <a href="${SITE_URL}" style="color: #999;">victorcfo.com</a></p>
</div>`.trim();
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: params.toEmail,
      subject: `Tu Modelo 480.6SP ${params.anio} — ${params.remitente}`,
      text: `Hola ${params.nombre}, ${params.remitente} te envía adjunto tu Modelo 480.6SP del año ${params.anio}.`,
      html,
      attachments: [{ filename: `480.6SP-${params.anio}.pdf`, content: params.pdf }],
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}


// 21 oct 2026: talonario de pago (recibo de nómina) al empleado. El cuerpo lo arma
// lib/nomina-talonario-html.ts; el logo de la compañía va como imagen adjunta en línea
// (cid:logo) porque está en R2 privado y muchos clientes bloquean data: URLs.
export async function sendTalonarioEmail(params: {
  toEmail: string;
  empresa: string;
  asunto: string;
  html: string;
  logo?: { buffer: Buffer; extension: "png" | "jpeg" };
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  try {
    const { error } = await resend.emails.send({
      from: `${params.empresa.replace(/[<>"]/g, "")} vía VICTOR CFO <${FROM_ADDRESS}>`,
      to: params.toEmail,
      subject: params.asunto,
      html: params.html,
      text: `${params.asunto}. Abre este correo en un lector que muestre HTML para ver tu talonario de pago.`,
      ...(params.logo
        ? { attachments: [{ filename: `logo.${params.logo.extension === "png" ? "png" : "jpg"}`, content: params.logo.buffer, contentType: params.logo.extension === "png" ? "image/png" : "image/jpeg", inlineContentId: "logo" }] }
        : {}),
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}

// Aviso oficial automático (30 oct 2026, pedido de Joel) — lo manda el cron
// /api/cron/avisos-oficiales cuando una fuente oficial (DTRH, Hacienda,
// Colegio de CPA, IRS) publica algo urgente que toca a lo que VICTOR cubre.
// VICTOR CFO NO emite el aviso: solo filtra y enlaza. Por eso el correo lo
// dice arriba, abajo y en el asunto no se presenta como "de VICTOR".
export async function sendAvisoOficialEmail(params: {
  toEmail: string;
  toName: string | null;
  userId: string;
  titulo: string;
  resumen: string;
  fuenteNombre: string;
  fuenteUrl: string;
  fechaLimite: string | null; // YYYY-MM-DD
  esContable: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };

  const { toEmail, toName, userId, titulo, resumen, fuenteNombre, fuenteUrl, fechaLimite, esContable } = params;
  const bajaUrl = urlBajaCorreos(SITE_URL, userId);
  const verEnApp = `${SITE_URL}${esContable ? "/cpa" : "/dashboard"}`;
  const limiteTxt = fechaLimite ? `Fecha límite indicada por la fuente: ${fechaLimite.split("-").reverse().join("/")}` : "";
  const disclaimer =
    "VICTOR CFO no redacta ni emite este aviso. Es un resumen automático de información publicada por una fuente oficial, filtrado por relevancia. Puede contener errores u omisiones y no constituye asesoría legal, contributiva ni contable. Verifica siempre en la fuente oficial y con tu contador antes de actuar.";

  const textoPlano =
    (toName ? `Hola ${toName},\n\n` : `Hola,\n\n`) +
    `Aviso de ${fuenteNombre}:\n\n${titulo}\n\n${resumen}\n\n${limiteTxt ? limiteTxt + "\n\n" : ""}Fuente oficial: ${fuenteUrl}\n\n` +
    `${disclaimer}\n\n— VICTOR CFO\nUn producto de West Capital Ventures LLC · ${SITE_URL}\n\nDejar de recibir estos avisos: ${bajaUrl}`;

  const html = `
<div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a; line-height: 1.5;">
  <div style="text-align: center; margin-bottom: 20px;">
    <img src="${SITE_URL}/victor-avatar.png" width="32" height="32" style="border-radius: 9999px; vertical-align: middle; display: inline-block;" alt="VICTOR" />
    <span style="font-size: 18px; font-weight: 600; vertical-align: middle; margin-left: 8px;">VICTOR CFO</span>
  </div>
  <p style="font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: #0F766E; margin: 0 0 6px 0;">Aviso publicado por ${escapeHtml(fuenteNombre)}</p>
  <h2 style="font-size: 20px; margin: 0 0 12px 0;">${escapeHtml(titulo)}</h2>
  <p style="color: #333;">${escapeHtml(resumen)}</p>
  ${limiteTxt ? `<p style="background: #FEF3C7; border-radius: 6px; padding: 8px 12px; font-size: 14px;"><strong>${escapeHtml(limiteTxt)}</strong></p>` : ""}
  <p style="text-align: center; margin: 22px 0;"><a href="${escapeHtml(fuenteUrl)}" style="background: #0F766E; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver la fuente oficial</a></p>
  <p style="text-align: center; font-size: 13px;"><a href="${verEnApp}" style="color: #0F766E;">Abrir VICTOR CFO</a></p>
  <p style="font-size: 12px; color: #666; background: #fafafa; border-left: 3px solid #ccc; padding: 10px 14px; border-radius: 4px; margin-top: 22px;">${escapeHtml(disclaimer)}</p>
  <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
  <p style="font-size: 12px; color: #999;">VICTOR CFO — un producto de West Capital Ventures LLC<br/><a href="${bajaUrl}" style="color: #999;">Dejar de recibir estos avisos</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `Aviso oficial: ${titulo}`.slice(0, 150),
      text: textoPlano,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}
