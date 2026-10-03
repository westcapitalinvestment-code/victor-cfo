// Calculadora de "deducción en riesgo" por falta de 480.6SP — pedido de
// Joel, 3 oct 2026: quería algo en la landing y en la demo que le enseñe
// a un prospecto que el plan Business "se paga solo" porque VICTOR ayuda a
// no perder deducciones reales por no reportar pagos a contratistas/
// suplidores/servicios profesionales.
//
// MARCO LEGAL — a propósito SIMPLE, sin meter CBA/AUP (Joel, 3 oct 2026:
// "vamos a dejarlo sencillo no complicarnos... lo que no podemos es dar
// información equivocada o errónea aunque no sea la más precisa"). Se usa
// SOLO la regla general, ya verificada en tax_knowledge_base (migración
// 0115): Sección 1033.01(a) del Código de Rentas Internas — un gasto por
// servicios solo es deducible si se cumplió con la retención (Sec.
// 1062.03) y se radicó la 480.6SP correspondiente; si no, Hacienda PUEDE
// desautorizar el gasto completo en la planilla. No se menciona la
// Contribución Básica Alterna (CBA) ni el informe AUP — esa es una capa
// adicional, más específica (solo individuos con ingreso neto sobre
// $25,000, y solo para entidades conducto en el caso del AUP) que
// complicaría el mensaje sin cambiar la conclusión práctica: sin 480.6SP,
// el gasto está en riesgo.
//
// Este archivo es la ÚNICA fuente de verdad del cálculo — tanto la sección
// de la landing (app/landing-page.tsx) como la calculadora dentro del
// dashboard (app/dashboard/pagos/pagos-portal.tsx, tab Reportes) importan
// esta misma función, para que el número nunca diverja entre los dos
// lugares. VICTOR_LANDING_SYSTEM_PROMPT explica la MISMA regla en palabras
// (ver lib/victor/landing-system-prompt.ts) pero no hace el cálculo él
// mismo — eso se lo deja a esta función, porque la aritmética de un LLM no
// es algo que se le deba mostrar a un prospecto como un número confiable.

export type TasaContributivaId = "individuo" | "corporacion";

// Tasas ILUSTRATIVAS, no el tramo exacto de nadie — el disclaimer en la UI
// deja esto claro. "individuo" usa un estimado de tramo medio-alto para
// LLC conducto/DBA reportando en planilla personal; "corporacion" usa la
// tasa regular corporativa de PR (sin la sobretasa marginal, que varía por
// tramo de ingreso neto).
export const TASA_CONTRIBUTIVA_ESTIMADA: Record<TasaContributivaId, number> = {
  individuo: 0.33,
  corporacion: 0.375,
};

export const TASA_CONTRIBUTIVA_LABEL: Record<TasaContributivaId, string> = {
  individuo: "Individuo / LLC conducto (reporta en planilla personal)",
  corporacion: "Corporación regular",
};

export interface ResultadoCalculadoraDeduccion {
  gasto: number;
  tasa: number;
  impuestoEnRiesgo: number;
}

export function calcularImpuestoEnRiesgo(
  gasto: number,
  tipoNegocio: TasaContributivaId
): ResultadoCalculadoraDeduccion {
  const gastoValido = Number.isFinite(gasto) && gasto > 0 ? gasto : 0;
  const tasa = TASA_CONTRIBUTIVA_ESTIMADA[tipoNegocio];
  return {
    gasto: gastoValido,
    tasa,
    impuestoEnRiesgo: Math.round(gastoValido * tasa * 100) / 100,
  };
}

// Copy compartido — mismo texto en landing y demo, para que no diverjan.
export const CALCULADORA_EXPLICACION =
  "Si en el año le pagas más de $500 a una persona o compañía por servicios (contratista, suplidor, profesional) y no presentas el Modelo 480.6SP correspondiente, Hacienda puede rechazarte esa deducción por completo en tu planilla (Sección 1033.01(a) del Código de Rentas Internas). El umbral de $500/año es el mismo que activa la retención de la Sección 1062.03.";

export const CALCULADORA_DISCLAIMER =
  "Esto es un estimado general con una tasa contributiva aproximada — tu situación específica puede variar. Para tu caso exacto, consulta con tu contable.";
