import { createHmac, timingSafeEqual } from "crypto";

// Sesión firmada del socio vendedor (portal /socios/portal, migración 0107,
// 29 sept 2026) — calcado de lib/tecnico-session.ts (Equipo/Técnicos). El
// vendedor NO tiene cuenta de Supabase, así que no hay auth.uid() que RLS
// pueda usar; entra con su código corto + PIN de 4 dígitos (ver
// app/api/socios/portal/login/route.ts) y esta cookie firmada es su
// "sesión" — las llamadas siguientes (/api/socios/portal/me) verifican la
// firma y usan la Service Role Key para leer en su nombre.
const SOCIO_SESSION_SECRET_LEGACY = "victor-cfo-socio-session-default";
const SOCIO_SESSION_SECRET = process.env.SOCIO_SESSION_SECRET || SOCIO_SESSION_SECRET_LEGACY;

const DURACION_SESION_SEG = 12 * 60 * 60; // 12h, mismo criterio que el técnico

function firmarCon(payload: string, secreto: string): string {
  return createHmac("sha256", secreto).update(payload).digest("hex");
}

function firmasCoinciden(firma: string, firmaEsperada: string): boolean {
  const a = Buffer.from(firma);
  const b = Buffer.from(firmaEsperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function crearSesionSocio(socioId: string): string {
  const expira = Math.floor(Date.now() / 1000) + DURACION_SESION_SEG;
  const payload = `${socioId}.${expira}`;
  return `${payload}.${firmarCon(payload, SOCIO_SESSION_SECRET)}`;
}

export function verificarSesionSocio(cookieValue: string | null | undefined): string | null {
  if (!cookieValue) return null;
  const partes = cookieValue.split(".");
  if (partes.length !== 3) return null;
  const [socioId, expiraStr, firma] = partes;
  const payload = `${socioId}.${expiraStr}`;

  const firmaValida =
    firmasCoinciden(firma, firmarCon(payload, SOCIO_SESSION_SECRET)) ||
    (SOCIO_SESSION_SECRET !== SOCIO_SESSION_SECRET_LEGACY &&
      firmasCoinciden(firma, firmarCon(payload, SOCIO_SESSION_SECRET_LEGACY)));
  if (!firmaValida) return null;

  const expira = Number(expiraStr);
  if (!expira || Date.now() / 1000 > expira) return null;

  return socioId;
}

export const COOKIE_SESION_SOCIO = "socio_session";
export const MAX_AGE_SESION_SOCIO = DURACION_SESION_SEG;
