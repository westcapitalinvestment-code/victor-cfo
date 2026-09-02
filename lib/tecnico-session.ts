import { createHmac, timingSafeEqual } from "crypto";

// Sesión firmada del técnico (2 sept 2026, módulo Equipo) — el técnico NO
// tiene cuenta de Supabase (entra por link+PIN, ver migración
// 0003_cpa_readonly_secretaria_y_tecnicos.sql), así que no hay auth.uid()
// que RLS pueda usar. Este cookie firmado es su "sesión": una vez valida su
// PIN en /api/tecnico/login, todas sus llamadas siguientes (crear visita,
// etc.) pasan por rutas que verifican esta firma y usan la Service Role Key
// para leer/escribir en su nombre — igual de intencional que el patrón de
// lib/pin.ts (SHA-256 + pepper): esto NO reemplaza la seguridad real de la
// cuenta del dueño, solo autentica al técnico frente al backend.
const TECNICO_SESSION_SECRET = process.env.TECNICO_SESSION_SECRET || "victor-cfo-tecnico-session-default";

const DURACION_SESION_SEG = 12 * 60 * 60; // 12h — cubre un día de trabajo de campo

function firmar(payload: string): string {
  return createHmac("sha256", TECNICO_SESSION_SECRET).update(payload).digest("hex");
}

export function crearSesionTecnico(technicianId: string): string {
  const expira = Math.floor(Date.now() / 1000) + DURACION_SESION_SEG;
  const payload = `${technicianId}.${expira}`;
  return `${payload}.${firmar(payload)}`;
}

// Devuelve el technicianId si la cookie es válida y no ha expirado, o null.
export function verificarSesionTecnico(cookieValue: string | null | undefined): string | null {
  if (!cookieValue) return null;
  const partes = cookieValue.split(".");
  if (partes.length !== 3) return null;
  const [technicianId, expiraStr, firma] = partes;
  const payload = `${technicianId}.${expiraStr}`;
  const firmaEsperada = firmar(payload);

  // Comparación de tiempo constante — evita timing attacks sobre la firma.
  const a = Buffer.from(firma);
  const b = Buffer.from(firmaEsperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expira = Number(expiraStr);
  if (!expira || Date.now() / 1000 > expira) return null;

  return technicianId;
}

export const COOKIE_SESION_TECNICO = "tecnico_session";
export const MAX_AGE_SESION_TECNICO = DURACION_SESION_SEG;
