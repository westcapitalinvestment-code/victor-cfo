// Constantes compartidas entre cliente y servidor para el selector de
// entidad activa. Viven en un archivo aparte de lib/entidad-activa.ts a
// propósito: ese otro archivo importa `cookies` de next/headers, que solo
// puede correr en servidor — si topbar.tsx (client component) importara
// algo de ahí, arrastra next/headers al bundle del navegador y el build de
// Vercel truena ("You're importing a component that needs next/headers").
export const COOKIE_ENTIDAD_ACTIVA = "victor_entidad_activa";
export const VALOR_VISTA_GLOBAL = "global";
