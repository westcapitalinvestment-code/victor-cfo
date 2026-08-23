import Stripe from "stripe";

// Cliente de Stripe — un solo lugar donde vive la llave secreta.
//
// OJO (23 agosto 2026, causa real del build rojo en Vercel): esto NO se
// puede crear como `export const stripe = new Stripe(...)` a nivel de
// módulo, porque el SDK de Stripe explota de inmediato si la llave viene
// vacía o undefined ("Neither apiKey nor config.authenticator provided").
// Next.js importa TODAS las rutas durante el build para analizarlas —
// aunque nadie las esté llamando todavía — así que ese throw pasaba en
// build time, no en runtime, y tumbaba el deploy entero incluso antes de
// que faltara configurar STRIPE_SECRET_KEY en Vercel.
//
// La solución es crear el cliente de forma perezosa (lazy): solo se
// instancia la primera vez que getStripe() se llama de verdad, dentro de
// una request real (checkout, webhook) — nunca al importar el archivo. Sin
// apiVersion explícita a propósito: así siempre usa la versión con la que
// se generó este SDK, sin tener que sincronizar un string de fecha a mano
// cada vez que se actualiza el paquete.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  }
  return _stripe;
}

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
