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

// Precio con descuento de referido — DEPRECADO (4 sept 2026, pedido de
// Joel: "que los 2 sean iguales", Core referido pasa de descuento
// permanente a primer mes gratis, igual que Pro — ver esReferidoConTrial
// en app/api/stripe/checkout/route.ts). Ya no se usa para checkouts
// nuevos, pero el Price ID sigue vivo aquí (nunca se borra un Price de
// Stripe) solo para que todosLosPriceIdsDePlanes() siga reconociendo a
// quien ya quedó suscrito con este precio antes del cambio.
const PRICE_ENV_VARS_CORE_REFERIDO: Record<Ciclo, string | undefined> = {
  mensual: process.env.STRIPE_PRICE_CORE_MENSUAL_REFERIDO,
  anual: process.env.STRIPE_PRICE_CORE_ANUAL_REFERIDO,
};

// Todos los Price IDs de PLANES reales (no addons) — 3 sept 2026, para el
// crédito de referido al que REFIERE (ver webhook, case "invoice.paid").
// Sirve para reconocer, dentro de los items de la suscripción del
// referidor, cuál de ellos es "el plan" (y no un addon como Técnicos o
// Secretaria) sin tener que guardar el plan/ciclo del referidor en una
// columna aparte — se lee directo de Stripe, que es la fuente real.
export function todosLosPriceIdsDePlanes(): string[] {
  return [
    ...Object.values(PRICE_ENV_VARS).flatMap((c) => [c.mensual, c.anual]),
    PRICE_ENV_VARS_CORE_REFERIDO.mensual,
    PRICE_ENV_VARS_CORE_REFERIDO.anual,
  ].filter((v): v is string => !!v);
}

// Nota (4 sept 2026): el parámetro esReferido ya NO cambia el Price ID —
// Core y Pro referidos ahora pagan el precio normal, con 30 días de
// trial aplicados aparte en subscription_data (ver checkout/route.ts).
// Se deja el parámetro en la firma sin uso para no romper el único
// caller existente; queda documentado el porqué en vez de borrarlo en
// silencio.
export function priceIdPara(plan: PlanId, ciclo: Ciclo, _esReferido: boolean = false): string | null {
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

// Addon "Secretaria" — 2 sept 2026, pedido de Joel: $10.00/mes POR SEAT (a
// diferencia de Técnicos, que es un precio plano hasta 3). La cantidad del
// subscription item se sincroniza con la cantidad de secretarias activas +
// invitaciones pendientes — ver /api/stripe/addon-admin/sincronizar.
// Renombrado de STRIPE_PRICE_ADDON_ADMIN a STRIPE_PRICE_ADDON_SECRE (2 sept
// 2026, pedido de Joel: "se puede confundir si los dos se llaman Admin o
// parecidos" — con el nivel Administrador nuevo, dos variables casi
// idénticas invitaban a poner el Price ID equivocado en la equivocada).
export function priceIdAddonSecretaria(): string | null {
  return process.env.STRIPE_PRICE_ADDON_SECRE || null;
}

// Addon "Administrador" — 2 sept 2026, nivel ampliado ($20.00/mes POR SEAT,
// migración 0056): además de todo lo de Secretaria, incluye Pagos, Metas,
// Bóveda y Cuentas (solo lectura). Es un SEGUNDO subscription item aparte
// del de Secretaria — un dueño puede tener seats de ambos niveles a la vez.
export function priceIdAddonAdministrador(): string | null {
  return process.env.STRIPE_PRICE_ADDON_ADMINISTRADOR || null;
}

// Addon "Entidad adicional" — 3 sept 2026, migración 0063 ($24.99/mes POR
// SEAT, mismo patrón que Secretaria/Administrador). La primera entidad de
// negocio va incluida en Pro; cada entidad activa adicional a esa se
// factura aparte. Ver app/api/stripe/addon-entidades/sincronizar.
export function priceIdAddonEntidadAdicional(): string | null {
  return process.env.STRIPE_PRICE_ADDON_ENTIDAD || null;
}

export function esCicloValido(valor: unknown): valor is Ciclo {
  return valor === "mensual" || valor === "anual";
}

// Créditos de IA comprables — 3 sept 2026, migración 0064, pedido de Joel:
// "ese limite lo podemos resolver poniendo un addon de creditos de AI como
// hace Anthropic". Pago ÚNICO (Stripe Checkout en modo "payment", no
// suscripción) — $10 pagados = $7.00 de presupuesto añadido al ciclo
// actual (30% de margen sobre el costo real de Anthropic, decisión de
// Joel: "con margen"). Lo que no se gaste en el ciclo en que se compra
// RUEDA al ciclo siguiente (pedido de Joel, mismo día: "me gustaria que se
// renueve que no lo pierda pq asi no se siente engañado el cliente") — ver
// app/api/stripe/webhook/route.ts (rodarCreditoAlNuevoCiclo) y
// app/api/victor/route.ts.
export function priceIdCreditosIA(): string | null {
  return process.env.STRIPE_PRICE_CREDITOS_IA || null;
}

// Cuánto presupuesto de IA (en centavos) se añade por cada compra del pack
// de créditos — vive aquí (no en el Price de Stripe) porque Stripe solo
// sabe el precio que cobra ($10), no cuánto de eso es "crédito" vs margen;
// esa relación es una decisión de negocio nuestra, no algo que Stripe
// exponga. Si el precio del pack cambia en Stripe, este número hay que
// ajustarlo a mano para mantener el mismo ~30% de margen.
export const CREDITO_IA_CENTAVOS_POR_COMPRA = 700;
