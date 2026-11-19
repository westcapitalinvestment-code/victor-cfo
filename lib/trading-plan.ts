// Plan Core + Trading (19 nov 2026, pedido de Joel). Reglas:
//  - Core + Trading ($19.99/mes, $179/año) = Core con el módulo de Trading.
//  - Pro y Business incluyen Trading sin costo extra (al subir se cobra solo
//    la diferencia de plan).
//  - Core solo (sin trading) lo ve con candado: "Agrega Trading por +$5".
//  - El módulo solo aparece en el menú si el usuario lo tiene activado
//    (users.trading_activo); quien entra por la página de trading lo tiene
//    activado desde el principio.
// La cookie vc_trading la pone la página /trading: así cualquier flujo de
// registro (email, Google, confirmar correo) termina cobrando Core + Trading
// sin tener que pasar el dato por cada pantalla.

export const COOKIE_TRADING = "vc_trading";
export const PRECIO_CORE_TRADING = { mensual: "19.99", anual: "179" } as const;

export function tieneAccesoTrading(p: { plan: string | null | undefined; tradingIncluido?: boolean | null; founder?: boolean }): boolean {
  if (p.founder) return true;
  if (p.plan === "pro" || p.plan === "proplus") return true;
  return !!p.tradingIncluido && p.plan === "core";
}

export function leerCookieTradingCliente(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c === `${COOKIE_TRADING}=1`);
}

export function marcarCookieTradingCliente(): void {
  if (typeof document === "undefined") return;
  const seguro = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_TRADING}=1; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax${seguro}`;
}
