// Motor de cálculo de nómina de Puerto Rico (19 oct 2026, pedido de Joel).
//
// Funciones PURAS: no leen la base de datos ni la hora. Reciben las tasas y
// topes ya cargados (tabla payroll_params, migración 0167) y devuelven los
// números. Así se pueden probar sin Supabase y cualquier cambio de ley es un
// UPDATE en la tabla, no un deploy.
//
// ALCANCE: VICTOR calcula — recibo del empleado, costo del patrono, montos a
// depositar y asiento contable. NO radica ni deposita nada.
//
// Dos capas, como pidió Joel:
//   1. Retenciones al empleado (se descuentan del cheque)
//   2. Contribuciones patronales (costo adicional de la corporación)
//
// Lo que NO modela (se avisa en `advertencias` cuando aplica): factor de
// ajuste gradual de Hacienda, reglas especiales de Seguro Social/SINOT para
// choferes, aportaciones al plan médico como pre-tax, y la tarifa real de
// horas extra según fecha de contratación.

import { impuestoPorTramos, type Tramo } from "./impuestos-estimados";

export type Frecuencia = "semanal" | "bisemanal" | "quincenal" | "mensual";

export const PERIODOS_POR_ANIO: Record<Frecuencia, number> = {
  semanal: 52,
  bisemanal: 26,
  quincenal: 24,
  mensual: 12,
};

// Claves que el motor necesita en payroll_params (federal + pr juntas; no
// chocan entre sí).
export const CLAVES_REQUERIDAS = [
  "ss_tasa",
  "ss_tope",
  "medicare_tasa",
  "medicare_adic_tasa",
  "medicare_adic_umbral",
  "futa_tasa_bruta",
  "futa_credito",
  "futa_tope",
  "sinot_emp_tasa",
  "sinot_pat_tasa",
  "sinot_tope",
  "suta_tope",
  "suta_tasa_default",
  "choferil_semanal",
  "ot_multiplo",
  "exencion_personal",
  "exencion_compartida",
  "dependiente_regular",
  "dependiente_univ",
  "deduccion_fija_soltero",
  "deduccion_fija_casado_conjunto",
  "deduccion_fija_casado_separado",
] as const;

export type ParamsNomina = Record<string, number>;

export interface EmpleadoNomina {
  id: string;
  nombre: string;
  frecuencia: Frecuencia;
  tipoPago: "salario" | "hora";
  tarifa: number; // salario: por periodo; hora: por hora
  estadoCivil: "soltero" | "casado_conjunto" | "casado_separado";
  exencionPersonal: "completa" | "compartida" | "ninguna";
  dependientes: number;
  dependientesUniv: number;
  retencionAdicional: number;
  deduccionMedico: number; // por periodo
  aporte401k: number; // por periodo
  esChofer: boolean;
}

export interface EntradaPeriodo {
  horasRegulares?: number; // solo tipoPago = hora
  horasExtra?: number;
  comisiones?: number;
  bonos?: number;
  otrosIngresos?: number;
  otrasDeducciones?: number;
}

// Acumulados del año ANTES de esta corrida.
export interface Acumulados {
  bruto: number;
  sinotBase: number;
  sutaBase: number;
  futaBase: number;
}

export const ACUMULADOS_CERO: Acumulados = { bruto: 0, sinotBase: 0, sutaBase: 0, futaBase: 0 };

export interface ConfigEntidadNomina {
  sutaTasa: number | null;
  cfseTasa: number | null;
  futaAplica: boolean;
}

export interface LineaNomina {
  employeeId: string;
  nombre: string;
  bruto: number;
  desglose: { regular: number; extra: number; comisiones: number; bonos: number; otros: number };
  // Empleado
  ssEmp: number;
  medicareEmp: number;
  medicareAdic: number;
  hacienda: number;
  sinotEmp: number;
  choferil: number;
  deduccionMedico: number;
  aporte401k: number;
  otrasDeducciones: number;
  neto: number;
  // Patrono
  ssPat: number;
  medicarePat: number;
  futa: number;
  suta: number;
  sinotPat: number;
  cfse: number;
  // Bases consumidas por esta línea
  baseSs: number;
  baseSinot: number;
  baseSuta: number;
  baseFuta: number;
  advertencias: string[];
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pos = (n: number) => (n > 0 ? n : 0);

export function faltantes(params: ParamsNomina): string[] {
  return CLAVES_REQUERIDAS.filter((k) => typeof params[k] !== "number" || Number.isNaN(params[k]));
}

// ---------------------------------------------------------------------------
// Cálculo por empleado
// ---------------------------------------------------------------------------
export function calcularEmpleado(
  emp: EmpleadoNomina,
  entrada: EntradaPeriodo,
  ytd: Acumulados,
  params: ParamsNomina,
  tramosPR: Tramo[],
  config: ConfigEntidadNomina
): LineaNomina {
  const falt = faltantes(params);
  if (falt.length > 0) throw new Error(`Faltan parámetros de nómina: ${falt.join(", ")}`);

  const adv: string[] = [];
  const n = PERIODOS_POR_ANIO[emp.frecuencia];

  // --- Salario bruto del periodo ---
  const horasReg = pos(entrada.horasRegulares ?? 0);
  const horasExtra = pos(entrada.horasExtra ?? 0);
  let regular: number;
  let tarifaHora: number;
  if (emp.tipoPago === "hora") {
    tarifaHora = emp.tarifa;
    regular = horasReg * tarifaHora;
  } else {
    regular = emp.tarifa;
    tarifaHora = (emp.tarifa * n) / 2080; // equivalente por hora de un salario, para horas extra
  }
  const extra = horasExtra * tarifaHora * params.ot_multiplo;
  const comisiones = pos(entrada.comisiones ?? 0);
  const bonos = pos(entrada.bonos ?? 0);
  const otros = pos(entrada.otrosIngresos ?? 0);
  const bruto = r2(regular + extra + comisiones + bonos + otros);
  if (horasExtra > 0) adv.push("Horas extra calculadas con el multiplicador configurado; confirmar la regla aplicable (fecha de contratación / tamaño del patrono).");

  // --- Seguro Social (OASDI) con tope anual ---
  const baseSs = r2(pos(Math.min(bruto, params.ss_tope - ytd.bruto)));
  const ssEmp = r2(baseSs * params.ss_tasa);
  const ssPat = ssEmp;

  // --- Medicare + adicional (solo empleado, sobre lo que pase de $200k) ---
  const medicareEmp = r2(bruto * params.medicare_tasa);
  const medicarePat = medicareEmp;
  const sobreUmbralAntes = pos(ytd.bruto - params.medicare_adic_umbral);
  const sobreUmbralDespues = pos(ytd.bruto + bruto - params.medicare_adic_umbral);
  const medicareAdic = r2((sobreUmbralDespues - sobreUmbralAntes) * params.medicare_adic_tasa);

  // --- Retención de contribución sobre ingresos de PR (método porcentual) ---
  const exencion =
    emp.exencionPersonal === "completa"
      ? params.exencion_personal
      : emp.exencionPersonal === "compartida"
        ? params.exencion_compartida
        : 0;
  const deduccionFija =
    emp.estadoCivil === "soltero"
      ? params.deduccion_fija_soltero
      : emp.estadoCivil === "casado_conjunto"
        ? params.deduccion_fija_casado_conjunto
        : params.deduccion_fija_casado_separado;
  const deps = emp.dependientes * params.dependiente_regular + emp.dependientesUniv * params.dependiente_univ;
  // El aporte al 401(k) de PR (Sec. 1081.01) reduce la base de la retención de ingresos.
  const anualizado = pos(bruto - emp.aporte401k) * n;
  const baseTributable = pos(anualizado - exencion - deduccionFija - deps);
  const contribAnual = impuestoPorTramos(baseTributable, tramosPR);
  const hacienda = r2(contribAnual / n + emp.retencionAdicional);
  adv.push("Retención de Hacienda por método porcentual con los tramos configurados; no incluye el factor de ajuste gradual. Validar contra la tabla oficial de SURI.");

  // --- SINOT (empleado y patrono) con tope anual ---
  const baseSinot = r2(pos(Math.min(bruto, params.sinot_tope - ytd.sinotBase)));
  const sinotEmp = r2(baseSinot * params.sinot_emp_tasa);
  const sinotPat = r2(baseSinot * params.sinot_pat_tasa);

  // --- Seguro de Choferes ---
  let choferil = 0;
  if (emp.esChofer) {
    choferil = r2((params.choferil_semanal * 52) / n);
    adv.push("Empleado marcado como chofer: se descuenta la tarifa de choferil, pero NO se modelan las reglas especiales de Seguro Social/SINOT para choferes. Revisar con el contable.");
  }

  // --- Patrono: FUTA / SUTA / CFSE ---
  const baseFuta = config.futaAplica ? r2(pos(Math.min(bruto, params.futa_tope - ytd.futaBase))) : 0;
  const futa = r2(baseFuta * (params.futa_tasa_bruta - params.futa_credito));
  const baseSuta = r2(pos(Math.min(bruto, params.suta_tope - ytd.sutaBase)));
  let tasaSuta = params.suta_tasa_default;
  if (config.sutaTasa === null || config.sutaTasa === undefined) {
    adv.push("La entidad no tiene configurada su tasa SUTA (la asigna el DTRH): se usó la tasa por defecto.");
  } else {
    tasaSuta = config.sutaTasa;
  }
  const suta = r2(baseSuta * tasaSuta);
  let cfse = 0;
  if (config.cfseTasa === null || config.cfseTasa === undefined) {
    adv.push("La entidad no tiene configurada su tasa de CFSE: la provisión de CFSE quedó en $0.");
  } else {
    cfse = r2(bruto * config.cfseTasa);
  }

  const deduccionMedico = r2(emp.deduccionMedico);
  const aporte401k = r2(emp.aporte401k);
  const otrasDeducciones = r2(pos(entrada.otrasDeducciones ?? 0));
  const neto = r2(
    bruto - ssEmp - medicareEmp - medicareAdic - hacienda - sinotEmp - choferil - deduccionMedico - aporte401k - otrasDeducciones
  );
  if (neto < 0) adv.push("El salario neto da negativo: las deducciones superan el bruto de este periodo.");

  return {
    employeeId: emp.id,
    nombre: emp.nombre,
    bruto,
    desglose: { regular: r2(regular), extra: r2(extra), comisiones: r2(comisiones), bonos: r2(bonos), otros: r2(otros) },
    ssEmp,
    medicareEmp,
    medicareAdic,
    hacienda,
    sinotEmp,
    choferil,
    deduccionMedico,
    aporte401k,
    otrasDeducciones,
    neto,
    ssPat,
    medicarePat,
    futa,
    suta,
    sinotPat,
    cfse,
    baseSs,
    baseSinot,
    baseSuta,
    baseFuta,
    advertencias: adv,
  };
}

// ---------------------------------------------------------------------------
// Consolidado de la corrida: totales, depósitos y asiento contable
// ---------------------------------------------------------------------------
export interface LineaAsiento {
  cuenta: string;
  debito: number;
  credito: number;
  nota?: string;
}

export interface ResumenCorrida {
  totales: {
    bruto: number;
    neto: number;
    retencionesEmpleado: number; // impuestos retenidos (FICA + Hacienda + SINOT + choferil)
    deduccionesVoluntarias: number;
    contribucionesPatronales: number; // incluye provisión CFSE
    costoTotalPatrono: number; // bruto + contribuciones patronales
    desglose: Record<string, number>;
  };
  depositos: {
    irs941: number; // FICA retenido + FICA patronal
    hacienda499R1B: number;
    dtrh: number; // SUTA + SINOT (emp + pat) + choferil
    futa: number;
    provisionCfse: number; // no se deposita con la corrida: se paga por póliza
  };
  asiento: LineaAsiento[];
  advertencias: string[];
}

export function consolidarCorrida(lineas: LineaNomina[]): ResumenCorrida {
  const sum = (f: (l: LineaNomina) => number) => r2(lineas.reduce((a, l) => a + f(l), 0));
  const bruto = sum((l) => l.bruto);
  const neto = sum((l) => l.neto);
  const ssEmp = sum((l) => l.ssEmp);
  const medEmp = sum((l) => l.medicareEmp);
  const medAdic = sum((l) => l.medicareAdic);
  const hacienda = sum((l) => l.hacienda);
  const sinotEmp = sum((l) => l.sinotEmp);
  const choferil = sum((l) => l.choferil);
  const ssPat = sum((l) => l.ssPat);
  const medPat = sum((l) => l.medicarePat);
  const futa = sum((l) => l.futa);
  const suta = sum((l) => l.suta);
  const sinotPat = sum((l) => l.sinotPat);
  const cfse = sum((l) => l.cfse);
  const voluntarias = r2(sum((l) => l.deduccionMedico) + sum((l) => l.aporte401k) + sum((l) => l.otrasDeducciones));

  const retencionesEmpleado = r2(ssEmp + medEmp + medAdic + hacienda + sinotEmp + choferil);
  const patronales = r2(ssPat + medPat + futa + suta + sinotPat + cfse);

  const asiento: LineaAsiento[] = [
    { cuenta: "Gasto Operacional — Sueldos y Salarios", debito: bruto, credito: 0 },
    {
      cuenta: "Gasto Operacional — Contribuciones Patronales",
      debito: patronales,
      credito: 0,
      nota: `FICA patrono ${r2(ssPat + medPat)} + FUTA ${futa} + SUTA ${suta} + SINOT patrono ${sinotPat} + provisión CFSE ${cfse}`,
    },
    {
      cuenta: "Pasivo Corriente — Retenciones por Pagar",
      debito: 0,
      credito: retencionesEmpleado,
      nota: `FICA empleado ${r2(ssEmp + medEmp + medAdic)} + Hacienda ${hacienda} + SINOT ${sinotEmp} + choferil ${choferil}`,
    },
  ];
  if (voluntarias > 0) {
    asiento.push({
      cuenta: "Pasivo Corriente — Deducciones Voluntarias por Pagar",
      debito: 0,
      credito: voluntarias,
      nota: "Plan médico, 401(k) y otras deducciones",
    });
  }
  asiento.push(
    { cuenta: "Pasivo Corriente — Impuestos Patronales por Pagar", debito: 0, credito: patronales },
    { cuenta: "Banco Comercial — Salario neto a desembolsar", debito: 0, credito: neto }
  );

  const advertencias = Array.from(new Set(lineas.flatMap((l) => l.advertencias)));

  return {
    totales: {
      bruto,
      neto,
      retencionesEmpleado,
      deduccionesVoluntarias: voluntarias,
      contribucionesPatronales: patronales,
      costoTotalPatrono: r2(bruto + patronales),
      desglose: { ssEmp, medEmp, medAdic, hacienda, sinotEmp, choferil, ssPat, medPat, futa, suta, sinotPat, cfse },
    },
    depositos: {
      irs941: r2(ssEmp + medEmp + medAdic + ssPat + medPat),
      hacienda499R1B: hacienda,
      dtrh: r2(suta + sinotEmp + sinotPat + choferil),
      futa,
      provisionCfse: cfse,
    },
    asiento,
    advertencias,
  };
}

// ¿El asiento cuadra? (débitos = créditos, tolerancia de 1 centavo por redondeo)
export function asientoCuadra(asiento: LineaAsiento[]): boolean {
  const d = asiento.reduce((a, l) => a + l.debito, 0);
  const c = asiento.reduce((a, l) => a + l.credito, 0);
  return Math.abs(d - c) <= 0.011;
}

// ---------------------------------------------------------------------------
// Acumulados del año: acumulados iniciales del empleado + corridas guardadas
// ---------------------------------------------------------------------------
export interface LineaGuardadaYtd {
  bruto: number;
  base_sinot: number;
  base_suta: number;
  base_futa: number;
}

export function acumuladosDesde(
  inicial: Partial<{ bruto: number; sinot_base: number; suta_base: number; futa_base: number }> | null | undefined,
  lineas: LineaGuardadaYtd[]
): Acumulados {
  const a: Acumulados = {
    bruto: Number(inicial?.bruto ?? 0),
    sinotBase: Number(inicial?.sinot_base ?? 0),
    sutaBase: Number(inicial?.suta_base ?? 0),
    futaBase: Number(inicial?.futa_base ?? 0),
  };
  for (const l of lineas) {
    a.bruto += Number(l.bruto);
    a.sinotBase += Number(l.base_sinot);
    a.sutaBase += Number(l.base_suta);
    a.futaBase += Number(l.base_futa);
  }
  return a;
}

// ---------------------------------------------------------------------------
// Parámetros desde las filas de payroll_params: toma, para cada clave, la fila
// del año más reciente <= `anio`.
// ---------------------------------------------------------------------------
export interface FilaParam {
  jurisdiccion: string;
  anio: number;
  clave: string;
  valor: number | string;
  por_confirmar?: boolean;
}

export function parametrosDesdeFilas(filas: FilaParam[], anio: number): { valores: ParamsNomina; porConfirmar: string[] } {
  const mejor = new Map<string, FilaParam>();
  for (const f of filas) {
    if (f.anio > anio) continue;
    const k = f.clave;
    const prev = mejor.get(k);
    if (!prev || f.anio > prev.anio) mejor.set(k, f);
  }
  const valores: ParamsNomina = {};
  const porConfirmar: string[] = [];
  mejor.forEach((f, k) => {
    valores[k] = Number(f.valor);
    if (f.por_confirmar) porConfirmar.push(k);
  });
  return { valores, porConfirmar };
}

// ---------------------------------------------------------------------------
// Fechas de depósito ESTIMADAS (por confirmar): último día del mes siguiente
// al cierre del trimestre del pago.
// ---------------------------------------------------------------------------
export function trimestreYVencimiento(fechaPago: string): { trimestre: string; vence: string } {
  const [y, m] = fechaPago.split("-").map(Number);
  const q = Math.ceil(m / 3);
  const mesCierre = q * 3; // 3, 6, 9, 12
  const mesVence = mesCierre + 1;
  const anioVence = mesVence > 12 ? y + 1 : y;
  const mesV = mesVence > 12 ? 1 : mesVence;
  const ultimoDia = new Date(Date.UTC(anioVence, mesV, 0)).getUTCDate();
  const vence = `${anioVence}-${String(mesV).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  return { trimestre: `T${q} ${y}`, vence };
}
