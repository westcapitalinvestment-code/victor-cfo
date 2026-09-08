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
//
// 8 sept 2026 — Joel confirmó que TECNICO_SESSION_SECRET nunca se puso en
// Vercel, así que toda cookie de sesión de técnico emitida hasta hoy está
// firmada con este default embebido en el código fuente — débil si el repo
// alguna vez se filtra. Si se pone un secreto real y verificarSesionTecnico
// solo aceptara ese secreto nuevo, cualquier técnico con una sesión activa
// (hasta 12h) quedaría deslogueado de golpe en medio de una visita, sin
// aviso. Por eso crearSesionTecnico() firma siempre con el secreto real del
// entorno si existe (o el legacy, si todavía no está puesto), pero
// verificarSesionTecnico() acepta TAMBIÉN una firma hecha con el legacy
// como último recurso — poner el secreto real no desloguea a nadie; cada
// sesión vieja expira sola a las 12h y la siguiente ya firma con el
// secreto real.
const TECNICO_SESSION_SECRET_LEGACY = "victor-cfo-tecnico-session-default";
const TECNICO_SESSION_SECRET = process.env.TECNICO_SESSION_SECRET || TECNICO_SESSION_SECRET_LEGACY;

const DURACION_SESION_SEG = 12 * 60 * 60; // 12h — cubre un día de trabajo de campo

function firmarCon(payload: string, secreto: string): string {
  return createHmac("sha256", secreto).update(payload).digest("hex");
}

function firmasCoinciden(firma: string, firmaEsperada: string): boolean {
  const a = Buffer.from(firma);
  const b = Buffer.from(firmaEsperada);
  // Comparación de tiempo constante — evita timing attacks sobre la firma.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function crearSesionTecnico(technicianId: string): string {
  const expira = Math.floor(Date.now() / 1000) + DURACION_SESION_SEG;
  const payload = `${technicianId}.${expira}`;
  return `${payload}.${firmarCon(payload, TECNICO_SESSION_SECRET)}`;
}

// Devuelve el technicianId si la cookie es válida y no ha expirado, o null.
// Acepta una firma hecha con el secreto actual o, si no coincide, con el
// default legacy (por si esa cookie se emitió antes de que
// TECNICO_SESSION_SECRET tuviera un valor real en el entorno).
export function verificarSesionTecnico(cookieValue: string | null | undefined): string | null {
  if (!cookieValue) return null;
  const partes = cookieValue.split(".");
  if (partes.length !== 3) return null;
  const [technicianId, expiraStr, firma] = partes;
  const payload = `${technicianId}.${expiraStr}`;

  const firmaValida =
    firmasCoinciden(firma, firmarCon(payload, TECNICO_SESSION_SECRET)) ||
    (TECNICO_SESSION_SECRET !== TECNICO_SESSION_SECRET_LEGACY &&
      firmasCoinciden(firma, firmarCon(payload, TECNICO_SESSION_SECRET_LEGACY)));
  if (!firmaValida) return null;

  const expira = Number(expiraStr);
  if (!expira || Date.now() / 1000 > expira) return null;

  return technicianId;
}

export const COOKIE_SESION_TECNICO = "tecnico_session";
export const MAX_AGE_SESION_TECNICO = DURACION_SESION_SEG;
