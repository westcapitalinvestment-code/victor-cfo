import crypto from "crypto";

// Cifrado a nivel de aplicación para secretos que viven en la base de
// datos — hoy solo plaid_items.access_token, pero cualquier otro secreto
// futuro (ej. tokens de otros bancos/agregadores) puede pasar por aquí.
// AES-256-GCM: cada valor se cifra con un IV nuevo, así que el mismo
// texto plano nunca produce el mismo texto cifrado dos veces, y GCM
// detecta si el dato fue alterado (authTag). La llave NUNCA vive en la
// base de datos — solo en PLAID_TOKEN_ENCRYPTION_KEY, en el servidor.
//
// Si Supabase (o cualquiera con acceso de lectura a la tabla) se ve
// comprometido, lo único que se filtra es texto cifrado inútil sin esta
// llave — que solo vive en el entorno de la app, no en la base de datos.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recomendado para GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.PLAID_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Falta PLAID_TOKEN_ENCRYPTION_KEY en el servidor — sin esto no se pueden cifrar ni leer los access_token de Plaid."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "PLAID_TOKEN_ENCRYPTION_KEY debe decodificar a 32 bytes en base64 — genera una con: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return key;
}

// Devuelve un solo string base64 (iv + authTag + texto cifrado juntos) —
// así la columna en Supabase sigue siendo un `text` normal, sin cambiar
// el schema.
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
