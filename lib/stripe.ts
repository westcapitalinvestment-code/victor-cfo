import Stripe from "stripe";

// Cliente de Stripe — un solo lugar donde vive la llave secreta. Sin
// apiVersion explícita a propósito: así siempre usa la versión con la que
// se generó este SDK, sin tener que sincronizar un string de fecha a mano
// cada vez que se actualiza el paquete.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export type PlanId = "core" | "pro" | "proplus";
export type Ciclo = "mensual" | "anual";

// Los 6 Price IDs (3 planes x 2 ciclos) se crean a mano en Stripe Dashboard
// → Products → "Add another price" sobre el producto correspondiente, y se
// pegan aquí como variables de entorno — nunca hardcodeados, porque
// cambian entre modo prueba (sk_test_) y modo real (sk_live_). Los precios
// en Stripe son inmutables: si cambia un monto, se crea un Price nuevo y
// se archiva el viejo — nunca se edita uno existente.
const PRICE_ENV_VARS: Record<PlanId, Record<Ciclo, string | undefined>> = {
  core: {
    mensual: process.env.STRIPE_PRICE_CORE_MENSUAL,
    anual: process.env.STRIPE_PRICE_CORE_ANUAL,
  },
  pro: {
    mensual: process.env.STRIPE_PRICE_PRO_MENSUAL,
    anual: process.env.STRIPE_PRICE_PRO_ANUAL,
  },
  proplus: {
    mensual: process.env.STRIPE_PRICE_PROPLUS_MENSUAL,
    anual: process.env.STRIPE_PRICE_PROPLUS_ANUAL,
  },
};

export function priceIdPara(plan: PlanId, ciclo: Ciclo): string | null {
  return PRICE_ENV_VARS[plan]?.[ciclo] || null;
}

export function esPlanValido(valor: unknown): valor is PlanId {
  return valor === "core" || valor === "pro" || valor === "proplus";
}

export function esCicloValido(valor: unknown): valor is Ciclo {
  return valor === "mensual" || valor === "anual";
}
