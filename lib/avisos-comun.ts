// Piezas puras de los avisos oficiales (sin SDK de Anthropic ni fetch) para
// poder importarlas desde componentes de servidor sin arrastrar el resto.
// Ver lib/avisos-oficiales.ts y app/api/cron/avisos-oficiales/route.ts.

export const DISCLAIMER_AVISOS =
  "VICTOR CFO no redacta ni emite estos avisos. Son resúmenes automáticos de información publicada por fuentes oficiales (Departamento del Trabajo, Hacienda, Colegio de CPA de Puerto Rico, IRS), filtrados por relevancia. Pueden contener errores u omisiones y no constituyen asesoría legal, contributiva ni contable. Verifica siempre en la fuente oficial (enlace) y con tu contador antes de actuar.";

export const DISCLAIMER_AVISOS_CORTO =
  "Resumen automático de una fuente oficial. VICTOR CFO no emite este aviso ni da asesoría; verifica en la fuente y con tu contador.";

export const TEMAS_AVISOS = [
  "nomina", // planillas trimestrales de desempleo/incapacidad/choferil, retenciones de empleados, SINOT, bono
  "contratistas", // 480.6SP, 1099-NEC, retención a contratistas
  "ivu", // IVU / sales tax
  "estimadas", // contribución estimada
  "planillas", // fechas de radicación de planillas (individuos, corporaciones, entidades conducto)
  "retiro", // límites de planes de retiro, IRA
  "general_fiscal", // otro cambio fiscal/administrativo que afecta a contribuyentes o negocios
  "federal", // IRS, afecta a pequeños negocios/autónomos/patronos
  "profesion", // reglas de la práctica de contabilidad, licencias, educación continuada de CPA
] as const;
export type TemaAviso = (typeof TEMAS_AVISOS)[number];


// --- segmentación -----------------------------------------------------------

// Temas "de módulo": solo le importan a quien usa ese módulo. El resto
// (planillas, estimadas, retiro, general, federal) le sirve a cualquier usuario.
export type Segmentos = { nomina: boolean; contratistas: boolean; ivu: boolean };

export function avisoAplicaA(temas: string[], seg: Segmentos): boolean {
  const especificos = temas.filter((t) => t === "nomina" || t === "contratistas" || t === "ivu" || t === "profesion");
  const generales = temas.filter((t) => !["nomina", "contratistas", "ivu", "profesion"].includes(t));
  if (generales.length > 0) return true;
  if (especificos.length === 0) return true;
  return (
    (temas.includes("nomina") && seg.nomina) ||
    (temas.includes("contratistas") && seg.contratistas) ||
    (temas.includes("ivu") && seg.ivu)
    // "profesion" solo es para contables (portal CPA), no para usuarios.
  );
}
