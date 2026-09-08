// Tope mensual de gasto de IA por plan, en centavos — extraído a un lugar
// compartido el 3 sept 2026 (migración 0064, rollover de créditos) para que
// tanto app/api/victor/route.ts (chequeo de presupuesto en vivo) como
// app/api/stripe/webhook/route.ts (cálculo de cuánto crédito sobró al
// cerrar un ciclo, para rodarlo al ciclo siguiente) usen el MISMO número —
// si divergieran, el webhook podría "perdonar" o "cobrar de más" crédito
// que no corresponde.
//
// Core $7.50, Pro $15.00 (pedido de Joel, 3 sept 2026: "si debe ser $7.50
// Core y vamos a ponerle $15 a Pro y elmina lo demas que no hay mas nada" —
// Pro+/Enterprise no se vende, así que no tiene entrada aquí).
export const LIMITES_MENSUALES_CENTAVOS: Record<string, number> = { core: 750, pro: 1500 };

// "Microtokens" — 8 sept 2026, pedido explícito de Joel: invertir el
// enfoque anterior (CAPA 13 del system prompt le decía a VICTOR que
// aclarara "esto NO es un conteo de tokens, es dólares reales"). Ahora es
// al revés — de cara al usuario, NUNCA se menciona dinero/costo real; todo
// se habla en "microtokens", una unidad propia de VICTOR (no es el token
// real de la API de Anthropic, que ya se usa internamente en uso_ia_log
// para otra cosa — cambiarle el nombre a esa unidad real habría chocado
// con esos registros). Es una conversión FIJA y puramente de presentación
// a partir de los centavos reales — el cálculo real de presupuesto/tope
// (route.ts, verificar_uso_ia) sigue siendo 100% en centavos por debajo;
// esto solo cambia cómo se le explica al usuario. Con este multiplicador,
// el presupuesto mensual de Core (750¢) se ve como 7,500,000 microtokens y
// el de Pro (1500¢) como 15,000,000 — números grandes y redondos a propósito.
export const MICROTOKENS_POR_CENTAVO = 10_000;

export function centavosAMicrotokens(centavos: number): number {
  return Math.round(centavos * MICROTOKENS_POR_CENTAVO);
}
