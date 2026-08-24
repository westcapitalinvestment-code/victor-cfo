// Único lugar que decide quién es "el founder" (Joel) para efectos de ver
// datos de negocio de TODOS los usuarios (Dashboard de Operaciones). No es
// lo mismo que "isFounder" en app/api/victor/route.ts (esa copia controla
// el tope de gasto de IA en el chat) — se mantienen separadas a propósito
// para no acoplar el chat de VICTOR con el acceso al panel de operaciones,
// pero usan el mismo correo.
const FOUNDER_EMAILS = ["dr.jvalentin@gmail.com"];

export function esFounder(email: string | null | undefined): boolean {
  return !!email && FOUNDER_EMAILS.includes(email.toLowerCase());
}
