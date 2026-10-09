// Motor de impuestos estimados (8 oct 2026, pedido de Joel): "que se vaya
// preparando el camino antes de que llegue el evento de las planillas" —
// cuánto apartar, cuánto sería el reintegro y las estimadas trimestrales
// (incluyendo el 15.3% de self-employment que los cuentapropistas le pagan
// al IRS, también los residentes de Puerto Rico).
//
// Este archivo es PURO (sin Supabase, sin fetch) para poder importarlo desde
// un componente de cliente y para poder probarlo con números a mano. Los
// tramos y parámetros vienen de las tablas tax_brackets / tax_params
// (migración 0144) — ver ahí las fuentes oficiales y lo que NO se modela.
//
// REGLAS QUE SE APLICAN (conservadoras a propósito, el estimado nunca debe
// quedarse corto sin avisar):
//  - Cuenta propia: SE tax = 92.35% de la ganancia neta × (12.4% hasta el
//    wage base del Seguro Social + 2.9% Medicare sin tope). Solo si la base
//    pasa de $400. Aplica igual a residentes de PR (se paga al IRS aunque
//    el impuesto sobre ingresos vaya a Hacienda).
//  - Residente de PR con ingreso de fuente PR: NO paga impuesto federal
//    sobre ingresos (IRC 933), solo SE tax federal + el impuesto de Hacienda
//    según los tramos de PR × el factor de ajuste (92% / 95%).
//  - Residente de EE.UU. (continental): impuesto federal por tramos sobre
//    (ganancia - mitad del SE tax - deducción estándar). Sin impuesto
//    estatal (no está modelado, la UI lo avisa).
//  - Corporación: PR = 18.5% normal + sobretasa graduada sobre (neto -
//    $25,000); EE.UU. = 21% plano. Sin SE tax.
//  - Empleado: sin SE tax; el bruto se estima como depósitos + lo retenido
//    (los depósitos de nómina vienen ya netos).

export interface Tramo {
  desde: number;
  tasa: number;
}

export interface DatosImpuestos {
  // Año de los datos realmente usados (el más reciente <= año actual).
  anioFederal: number;
  anioPR: number;
  federal: { single: Tramo[]; mfj: Tramo[]; params: Record<string, number> };
  pr: { individuo: Tramo[]; corp_surtax: Tramo[]; params: Record<string, number> };
}

export type Residencia = "pr" | "us";
export type EstatusFiscal = "single" | "mfj";
export type TipoContribuyente = "cuenta_propia" | "empleado" | "corporacion";

export interface PerfilImpuestos {
  residencia: Residencia;
  estatus: EstatusFiscal;
  tipo: TipoContribuyente;
  gastosDeduciblesPct: number;
  retenidoYTD: number;
  estimadasPagadasYTD: number;
}

export const PERFIL_POR_DEFECTO: PerfilImpuestos = {
  residencia: "pr",
  estatus: "single",
  tipo: "cuenta_propia",
  gastosDeduciblesPct: 0,
  retenidoYTD: 0,
  estimadasPagadasYTD: 0,
};

export interface EntradaEstimado {
  datos: DatosImpuestos;
  perfil: PerfilImpuestos;
  // Depósitos (tipo_flujo = ingreso) del año a la fecha, en positivo.
  ingresosYTD: number;
  // Gastos deducibles ya categorizados (monto × deducible_multiplier). Solo
  // se pasa en Negocio; en Personal va 0.
  gastosDeduciblesYTD: number;
  // Ingreso del mes en curso (para "apartaste X de Y este mes").
  ingresoMesActual: number;
  // "YYYY-MM-DD" en hora de Puerto Rico (fechaHoyPR()).
  hoyStr: string;
}

export interface Cuota {
  fecha: string; // YYYY-MM-DD
  etiqueta: string;
  irs: number;
  hacienda: number;
  total: number;
}

export interface ResultadoEstimado {
  anio: number;
  // Proyección a fin de año al mismo ritmo diario de lo que va del año.
  ingresoBrutoProyectado: number;
  gastosProyectados: number;
  netoProyectado: number;
  seTax: number;
  impuestoFederal: number;
  impuestoPR: number;
  totalImpuesto: number;
  // Lo que ya está pagado o retenido (a mano, del perfil).
  pagadoYTD: number;
  // Total proyectado - pagado. Positivo = falta pagar; negativo = reintegro.
  balance: number;
  // % del ingreso bruto que conviene apartar de cada depósito.
  tasaApartado: number;
  // Lo que "debería estar apartado" a hoy según lo que ya entró este año.
  apartadoYTD: number;
  // Lo que corresponde apartar del ingreso de ESTE mes.
  apartadoMes: number;
  // Próximas cuotas (solo las que aún no vencen). Vacío si tipo = empleado.
  cuotas: Cuota[];
  // Separación para mostrar "al IRS" vs "a Hacienda" (año proyectado).
  totalIRS: number;
  totalHacienda: number;
  // Proyección poco confiable (menos de 30 días de data en el año).
  proyeccionTemprana: boolean;
  supuestos: string[];
}

// ---------------------------------------------------------------------------

export function impuestoPorTramos(base: number, tramos: Tramo[]): number {
  if (!(base > 0) || tramos.length === 0) return 0;
  const orden = [...tramos].sort((a, b) => a.desde - b.desde);
  let total = 0;
  for (let i = 0; i < orden.length; i++) {
    const techo = i + 1 < orden.length ? orden[i + 1].desde : Infinity;
    const porcion = Math.min(base, techo) - orden[i].desde;
    if (porcion > 0) total += porcion * orden[i].tasa;
  }
  return total;
}

export function calcularSeTax(neto: number, params: Record<string, number>) {
  const factor = params.se_factor_neto ?? 0.9235;
  const base = Math.max(0, neto) * factor;
  if (base < (params.se_minimo ?? 400)) return { seTax: 0, mitad: 0 };
  const ss = (params.se_tasa_seguro_social ?? 0.124) * Math.min(base, params.ss_wage_base ?? 184500);
  const medicare = (params.se_tasa_medicare ?? 0.029) * base;
  const seTax = ss + medicare;
  return { seTax, mitad: seTax / 2 };
}

// Fechas límite de las contribuciones estimadas (año calendario).
// Individuos: 15 abr, 15 jun, 15 sep, 15 ene del año siguiente.
// Corporaciones (año calendario): 15 abr, 15 jun, 15 sep, 15 dic.
// Las de Puerto Rico para individuos siguen el mismo calendario federal —
// PENDIENTE confirmar con el contable (ver #500).
export function fechasCuotas(anio: number, tipo: TipoContribuyente): { fecha: string; etiqueta: string }[] {
  const ultima =
    tipo === "corporacion"
      ? { fecha: `${anio}-12-15`, etiqueta: "15 dic" }
      : { fecha: `${anio + 1}-01-15`, etiqueta: `15 ene ${anio + 1}` };
  return [
    { fecha: `${anio}-04-15`, etiqueta: "15 abr" },
    { fecha: `${anio}-06-15`, etiqueta: "15 jun" },
    { fecha: `${anio}-09-15`, etiqueta: "15 sep" },
    ultima,
  ];
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export function calcularEstimado(entrada: EntradaEstimado): ResultadoEstimado {
  const { datos, perfil, hoyStr } = entrada;
  const anio = Number(hoyStr.slice(0, 4));
  const MS = 24 * 60 * 60 * 1000;
  const inicio = new Date(`${anio}-01-01T00:00:00Z`).getTime();
  const finExclusivo = new Date(`${anio + 1}-01-01T00:00:00Z`).getTime();
  const hoy = new Date(`${hoyStr}T00:00:00Z`).getTime();
  const diasEnAnio = Math.round((finExclusivo - inicio) / MS);
  const diasTranscurridos = Math.max(1, Math.round((hoy - inicio) / MS) + 1);
  const factorProyeccion = diasEnAnio / diasTranscurridos;

  const supuestos: string[] = [];

  // --- Ingreso bruto y gastos (año a la fecha) ---------------------------
  let brutoYTD = entrada.ingresosYTD;
  if (perfil.tipo === "empleado") {
    brutoYTD = entrada.ingresosYTD + perfil.retenidoYTD;
    supuestos.push("Tu salario bruto se estima como depósitos + lo que te han retenido (los depósitos de nómina vienen netos).");
  }
  let gastosYTD = entrada.gastosDeduciblesYTD;
  if (perfil.tipo !== "empleado" && perfil.gastosDeduciblesPct > 0) {
    gastosYTD += (brutoYTD * perfil.gastosDeduciblesPct) / 100;
    supuestos.push(`Se estima que ${perfil.gastosDeduciblesPct}% de tus ingresos son gastos deducibles.`);
  }
  if (perfil.tipo === "empleado") gastosYTD = 0;

  const ingresoBrutoProyectado = brutoYTD * factorProyeccion;
  const gastosProyectados = gastosYTD * factorProyeccion;
  const netoProyectado = Math.max(0, ingresoBrutoProyectado - gastosProyectados);

  // --- Impuestos ---------------------------------------------------------
  let seTax = 0;
  let impuestoFederal = 0;
  let impuestoPR = 0;

  const paramsFed = datos.federal.params;
  const paramsPR = datos.pr.params;

  if (perfil.tipo === "cuenta_propia") {
    const se = calcularSeTax(netoProyectado, paramsFed);
    seTax = se.seTax;
    if (se.seTax > 0) supuestos.push("Incluye el 15.3% de self-employment (Seguro Social + Medicare) que se paga al IRS.");
    if (perfil.residencia === "pr") {
      const ajuste =
        ingresoBrutoProyectado > (paramsPR.factor_ajuste_umbral ?? 100000)
          ? (paramsPR.factor_ajuste_alto ?? 0.95)
          : (paramsPR.factor_ajuste_bajo ?? 0.92);
      impuestoPR = impuestoPorTramos(netoProyectado, datos.pr.individuo) * ajuste;
      supuestos.push("Residente de PR: el impuesto sobre ingresos va a Hacienda; al IRS solo el self-employment.");
    } else {
      const deduccion =
        perfil.estatus === "mfj" ? (paramsFed.deduccion_estandar_mfj ?? 0) : (paramsFed.deduccion_estandar_single ?? 0);
      const tramos = perfil.estatus === "mfj" ? datos.federal.mfj : datos.federal.single;
      impuestoFederal = impuestoPorTramos(Math.max(0, netoProyectado - se.mitad - deduccion), tramos);
      supuestos.push("No incluye impuesto estatal.");
    }
  } else if (perfil.tipo === "corporacion") {
    if (perfil.residencia === "pr") {
      const normal = (paramsPR.tasa_normal_corporacion ?? 0.185) * netoProyectado;
      const surtaxNeto = Math.max(0, netoProyectado - (paramsPR.surtax_deduccion_especial ?? 25000));
      impuestoPR = normal + impuestoPorTramos(surtaxNeto, datos.pr.corp_surtax);
      supuestos.push("Corporación en PR: 18.5% normal + sobretasa graduada. No incluye CBA/AMT.");
    } else {
      impuestoFederal = (paramsFed.tasa_corporacion ?? 0.21) * netoProyectado;
      supuestos.push("Corporación en EE.UU.: tasa federal de 21%. No incluye impuesto estatal.");
    }
  } else {
    // empleado
    if (perfil.residencia === "pr") {
      const ajuste =
        ingresoBrutoProyectado > (paramsPR.factor_ajuste_umbral ?? 100000)
          ? (paramsPR.factor_ajuste_alto ?? 0.95)
          : (paramsPR.factor_ajuste_bajo ?? 0.92);
      impuestoPR = impuestoPorTramos(netoProyectado, datos.pr.individuo) * ajuste;
    } else {
      const deduccion =
        perfil.estatus === "mfj" ? (paramsFed.deduccion_estandar_mfj ?? 0) : (paramsFed.deduccion_estandar_single ?? 0);
      const tramos = perfil.estatus === "mfj" ? datos.federal.mfj : datos.federal.single;
      impuestoFederal = impuestoPorTramos(Math.max(0, netoProyectado - deduccion), tramos);
      supuestos.push("No incluye impuesto estatal.");
    }
  }

  seTax = redondear(seTax);
  impuestoFederal = redondear(impuestoFederal);
  impuestoPR = redondear(impuestoPR);
  const totalImpuesto = redondear(seTax + impuestoFederal + impuestoPR);
  const totalIRS = redondear(seTax + impuestoFederal);
  const totalHacienda = impuestoPR;

  const pagadoYTD = redondear(perfil.estimadasPagadasYTD + perfil.retenidoYTD);
  const balance = redondear(totalImpuesto - pagadoYTD);

  // --- Cuánto apartar ----------------------------------------------------
  // Se calcula sobre el ingreso que de verdad entra a la cuenta. Para un
  // empleado los depósitos ya van netos de retención, así que "apartar" no
  // aplica (se muestra el reintegro/balance en su lugar).
  const tasaApartado =
    perfil.tipo !== "empleado" && ingresoBrutoProyectado > 0 ? totalImpuesto / ingresoBrutoProyectado : 0;
  const apartadoYTD = redondear(entrada.ingresosYTD * tasaApartado);
  const apartadoMes = redondear(entrada.ingresoMesActual * tasaApartado);

  // --- Estimadas trimestrales -------------------------------------------
  const cuotas: Cuota[] = [];
  if (perfil.tipo !== "empleado" && totalImpuesto > 0) {
    const restantes = fechasCuotas(anio, perfil.tipo).filter((c) => c.fecha >= hoyStr);
    const porPagar = Math.max(0, balance);
    if (restantes.length > 0 && porPagar > 0) {
      const fracIRS = totalIRS / totalImpuesto;
      const porCuota = porPagar / restantes.length;
      for (const c of restantes) {
        const irs = redondear(porCuota * fracIRS);
        const hacienda = redondear(porCuota * (1 - fracIRS));
        cuotas.push({ fecha: c.fecha, etiqueta: c.etiqueta, irs, hacienda, total: redondear(irs + hacienda) });
      }
    }
  }

  return {
    anio,
    ingresoBrutoProyectado: redondear(ingresoBrutoProyectado),
    gastosProyectados: redondear(gastosProyectados),
    netoProyectado: redondear(netoProyectado),
    seTax,
    impuestoFederal,
    impuestoPR,
    totalImpuesto,
    pagadoYTD,
    balance,
    tasaApartado,
    apartadoYTD,
    apartadoMes,
    cuotas,
    totalIRS,
    totalHacienda,
    proyeccionTemprana: diasTranscurridos < 30,
    supuestos,
  };
}
