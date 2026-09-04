import { randomInt, createHash } from "crypto";

// Códigos de respaldo de MFA (ver migración 0068 y app/dashboard/mfa-config.tsx)
// — la puerta de emergencia para entrar a la cuenta cuando alguien pierde el
// celular con su app de autenticación (Google Authenticator, Authy, etc.).
//
// A diferencia del PIN de bloqueo (lib/pin.ts), esto SÍ es una credencial
// real, así que el charset evita caracteres que se confunden a simple vista
// al copiarlos a mano (0/O, 1/I/L) y cada código tiene suficiente entropía
// propia (10 caracteres de un alfabeto de 32 ≈ 50 bits) para que un hash
// simple con pepper alcance — el riesgo no es fuerza bruta contra el hash,
// es que el código se filtre en texto plano, y eso el hash no lo evita de
// todas formas.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I/L
const MFA_BACKUP_PEPPER = process.env.MFA_BACKUP_PEPPER || "victor-cfo-mfa-backup-pepper-default";

function generarUnCodigo(): string {
  let codigo = "";
  for (let i = 0; i < 10; i++) {
    codigo += ALFABETO[randomInt(ALFABETO.length)];
  }
  // Formato XXXXX-XXXXX — más fácil de leer/transcribir a mano que 10
  // caracteres seguidos.
  return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
}

export function generarCodigosDeRespaldo(cantidad = 10): string[] {
  return Array.from({ length: cantidad }, generarUnCodigo);
}

// Normaliza antes de hashear/comparar: mayúsculas, sin espacios ni guiones —
// así "abcde-fghjk", "ABCDE-FGHJK" y "ABCDEFGHJK" (por si alguien lo
// transcribe distinto) hashean igual.
function normalizar(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashCodigoRespaldo(codigo: string): string {
  return createHash("sha256").update(`${normalizar(codigo)}:${MFA_BACKUP_PEPPER}`).digest("hex");
}
