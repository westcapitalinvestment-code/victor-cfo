import { createHmac, timingSafeEqual } from "crypto";

// Link de baja de correos de marketing (nurture/tips). Token = HMAC del id
// del usuario con CRON_SECRET (solo servidor), así nadie puede dar de baja
// a otro adivinando ids y no hace falta tabla de tokens.
function firmar(userId: string): string {
  const secreto = process.env.CRON_SECRET || "";
  return createHmac("sha256", secreto).update(`baja:${userId}`).digest("hex").slice(0, 32);
}

export function urlBajaCorreos(siteUrl: string, userId: string): string {
  return `${siteUrl}/api/email/baja?u=${encodeURIComponent(userId)}&t=${firmar(userId)}`;
}

export function tokenBajaValido(userId: string, token: string): boolean {
  if (!process.env.CRON_SECRET) return false;
  const esperado = Buffer.from(firmar(userId));
  const recibido = Buffer.from(token || "");
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
