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
//
// 8 sept 2026 — Joel confirmó que PIN_PEPPER nunca se puso en Vercel, así
// que TODO PIN ya guardado (el del dueño y el de cada técnico, mismo
// esquema) está hasheado con este default embebido en el código fuente —
// débil si el repo alguna vez se filtra. Al poner un PIN_PEPPER real,
// TODOS esos hashes viejos dejarían de coincidir de golpe si el código
// solo aceptara el pepper nuevo — cada quien que ya tenía PIN puesto se
// quedaría fuera sin aviso, viendo "PIN incorrecto" sin saber por qué.
// Por eso hashPin() (usada al PONER o CAMBIAR un PIN) siempre usa el
// pepper real del entorno si existe, pero verificarPin() acepta TAMBIÉN
// el default legacy como último recurso — migrar a un pepper real no
// rompe a nadie que ya tenía PIN puesto de antes; con el tiempo, cada
// quien que cambie su PIN queda migrado al pepper real solo.
const PIN_PEPPER_LEGACY = "victor-cfo-pin-pepper-default";
const PIN_PEPPER = process.env.PIN_PEPPER || PIN_PEPPER_LEGACY;

function hash(pin: string, userId: string, pepper: string): string {
  return createHash("sha256").update(`${pin}:${userId}:${pepper}`).digest("hex");
}

// Para PIN nuevo o cambio de PIN — siempre con el pepper real actual (o el
// legacy, si PIN_PEPPER todavía no está puesto en el entorno).
export function hashPin(pin: string, userId: string): string {
  return hash(pin, userId, PIN_PEPPER);
}

// Para verificar un PIN ya guardado — acepta el pepper actual y, si no
// coincide, el default legacy (por si ese PIN se guardó antes de que
// PIN_PEPPER tuviera un valor real en el entorno).
export function verificarPin(pin: string, userId: string, hashGuardado: string): boolean {
  if (hash(pin, userId, PIN_PEPPER) === hashGuardado) return true;
  if (PIN_PEPPER !== PIN_PEPPER_LEGACY && hash(pin, userId, PIN_PEPPER_LEGACY) === hashGuardado) return true;
  return false;
}
