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
