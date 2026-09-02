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

// Precio con descuento de referido (30 agosto 2026) — solo existe para
// Core, y solo aplica cuando el usuario que va a pagar tiene un
// referred_by real (alguien lo invitó con su link). Sin referidor, paga
// el precio normal de PRICE_ENV_VARS de arriba — por diseño no hace falta
// ninguna lógica especial para ese caso, ya existía.
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

// Addon "Equipo" (técnicos) — 2 sept 2026, pedido de Joel: "$49.99 pero
// con los Addon sube de precio, Técnicos $20.00 hasta 3 técnicos". A
// diferencia de los planes, esto NO es una suscripción aparte — es un
// SEGUNDO subscription item que se añade a la suscripción Pro que el
// usuario ya tiene, así que la factura de Stripe queda como un solo cargo
// combinado (Pro + Equipo). Solo mensual, sin ciclo anual todavía.
export function priceIdAddonTecnicos(): string | null {
  return process.env.STRIPE_PRICE_ADDON_TECNICOS || null;
}

// Addon "Admin/Secretaria" — 2 sept 2026, pedido de Joel: $10.00/mes POR
// SEAT (a diferencia de Técnicos, que es un precio plano hasta 3). La
// cantidad del subscription item se sincroniza con la cantidad de admins
// activos + invitaciones pendientes — ver /api/stripe/addon-admin/sincronizar.
export function priceIdAddonAdmin(): string | null {
  return process.env.STRIPE_PRICE_ADDON_ADMIN || null;
}

// Addon "Administrador" — 2 sept 2026, nivel ampliado ($20.00/mes POR SEAT,
// migración 0056): además de todo lo de Secretaria, incluye Pagos, Metas,
// Bóveda y Cuentas (solo lectura). Es un SEGUNDO subscription item aparte
// del de Secretaria — un dueño puede tener seats de ambos niveles a la vez.
export function priceIdAddonAdministrador(): string | null {
  return process.env.STRIPE_PRICE_ADDON_ADMINISTRADOR || null;
}

export function esCicloValido(valor: unknown): valor is Ciclo {
  return valor === "mensual" || valor === "anual";
}
