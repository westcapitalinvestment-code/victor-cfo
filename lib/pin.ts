import { createHash } from "crypto";

// Hash del PIN de bloqueo rápido (ver migración 0030 y app/dashboard/pin-gate.tsx).
//
// El PIN NO es el mecanismo de seguridad real de la cuenta — eso lo sigue
// haciendo la sesión de Supabase. Es solo una traba rápida en pantalla, así
// que alcanza con SHA-256 + un pepper fijo del servidor en vez de
// bcrypt/argon2 con salt por usuario: lo que limita la fuerza bruta no es
// la lentitud del hash, es que /api/pin/verify exige la sesión de Supabase
// ya activa (no es un endpoint público) y el PinGate del cliente se
// autobloquea tras varios intentos fallidos seguidos.
const PIN_PEPPER = process.env.PIN_PEPPER || "victor-cfo-pin-pepper-default";

export function hashPin(pin: string, userId: string): string {
  return createHash("sha256").update(`${pin}:${userId}:${PIN_PEPPER}`).digest("hex");
}
