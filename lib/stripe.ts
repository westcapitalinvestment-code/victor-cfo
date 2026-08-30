import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  }
  return _stripe;
}

export type PlanId = "core" | "pro" | "proplus";
export type Ciclo = "mensual" | "anual";

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

// Precio con descuento de referido (30 agosto 2026) — solo Core.
const PRICE_ENV_VARS_CORE_REFERIDO: Record<Ciclo, string | undefined> = {
  mensual: process.env.STRIPE_PRICE_CORE_MENSUAL_REFERIDO,
  anual: process.env.STRIPE_PRICE_CORE_ANUAL_REFERIDO,
};

export function priceIdPara(plan: PlanId, ciclo: Ciclo, esReferido: boolean = false): string | null {
  if (plan === "core" && esReferido) {
    return PRICE_ENV_VARS_CORE_REFERIDO[ciclo] || PRICE_ENV_VARS.core[ciclo] || null;
  }
  return PRICE_ENV_VARS[plan]?.[ciclo] || null;
}

export function esPlanValido(valor: unknown): valor is PlanId {
  return valor === "core" || valor === "pro" || valor === "proplus";
}

export function esCicloValido(valor: unknown): valor is Ciclo {
  return valor === "mensual" || valor === "anual";
}
