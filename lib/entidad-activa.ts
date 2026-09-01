import { cookies } from "next/headers";
import { COOKIE_ENTIDAD_ACTIVA, VALOR_VISTA_GLOBAL } from "./entidad-activa-constantes";

// Funciones server-only (usan cookies() de next/headers) para resolver cuál
// entidad de negocio quedó activa en el selector "Negocio" del topbar — ver
// lib/entidad-activa-constantes.ts para las constantes compartidas con el
// cliente. Solo se debe importar este archivo desde Server Components o
// Route Handlers, nunca desde un "use client".
export { COOKIE_ENTIDAD_ACTIVA, VALOR_VISTA_GLOBAL };

export function leerEntidadActivaCookie(): string | null {
  return cookies().get(COOKIE_ENTIDAD_ACTIVA)?.value ?? null;
}

// Dada la lista real de entidades del usuario y el valor crudo de la
// cookie, resuelve cuál debe quedar activa ahora mismo. Si la cookie no
// existe todavía, o apunta a una entidad que ya no existe/no es del
// usuario, cae de vuelta a la primera entidad — el mismo comportamiento que
// tenía la app antes de este cambio, para no romper nada de golpe.
export function resolverEntidadActiva(
  entidades: { id: string }[],
  cookieValue: string | null
): { entidadId: string | null; vistaGlobal: boolean } {
  if (!entidades || entidades.length === 0) {
    return { entidadId: null, vistaGlobal: false };
  }
  if (cookieValue === VALOR_VISTA_GLOBAL) {
    return { entidadId: null, vistaGlobal: true };
  }
  if (cookieValue && entidades.some((e) => e.id === cookieValue)) {
    return { entidadId: cookieValue, vistaGlobal: false };
  }
  return { entidadId: entidades[0].id, vistaGlobal: false };
}
