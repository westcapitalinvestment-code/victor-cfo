import { cookies } from "next/headers";

// Cookie que recuerda qué entidad de negocio quedó seleccionada en el
// dropdown "Negocio" del topbar (o si el usuario eligió "Vista global —
// todas las entidades"). Se lee server-side en cada página que necesite
// filtrar facturas/cotizaciones/clientes por entidad — así cada entidad
// tiene su propia facturación separada dentro del mismo sistema, en vez de
// mezclar todo bajo el owner_id como pasaba antes.
export const COOKIE_ENTIDAD_ACTIVA = "victor_entidad_activa";
export const VALOR_VISTA_GLOBAL = "global";

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
