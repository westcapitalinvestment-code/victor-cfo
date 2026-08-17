import { Resend } from "resend";

// Envío de correo transaccional — hoy solo se usa para la invitación al
// contable/CPA, pero cualquier otro email futuro (recordatorios, recibos)
// puede pasar por aquí. Si RESEND_API_KEY no está configurada, la función
// no revienta la petición — devuelve sent:false y quien la llame decide
// qué decirle al usuario (mismo patrón honesto que Plaid sin conectar).
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// resend.dev es el dominio de pruebas de Resend — funciona sin verificar
// nada, pero solo entrega a la bandeja del dueño de la cuenta de Resend.
// Para que le llegue de verdad al contable invitado, hay que verificar un
// dominio propio (ej. victorcfo.com) en Resend y cambiar esto por
// "VICTOR <notificaciones@victorcfo.com>".
const FROM = process.env.RESEND_FROM_EMAIL || "VICTOR <onboarding@resend.dev>";

export async function sendCpaInvitationEmail(params: {
  cpaEmail: string;
  cpaName: string | null;
  ownerName: string | null;
  customMessage: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY no está configurada en el servidor." };
  }

  const { cpaEmail, cpaName, ownerName, customMessage } = params;
  const saludo = cpaName ? `Hola ${cpaName},` : "Hola,";
  const quien = ownerName || "Un cliente";

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: cpaEmail,
      subject: `${quien} te invitó a ver sus finanzas en VICTOR`,
      text:
        `${saludo}\n\n` +
        `${quien} te invitó a VICTOR, su Director Financiero Virtual, para que puedas ver lo que ` +
        `comparta contigo — es gratis para ti, sin costo adicional.\n\n` +
        (customMessage ? `Mensaje de ${quien}:\n"${customMessage}"\n\n` : "") +
        `— VICTOR`,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Error desconocido enviando el correo." };
  }
}
