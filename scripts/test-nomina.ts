// Pruebas del motor de nómina. Correr con:
//   npx esbuild scripts/test-nomina.ts --bundle --platform=node --outfile=/tmp/test-nomina.cjs && node /tmp/test-nomina.cjs
import assert from "node:assert/strict";
import {
  calcularEmpleado,
  consolidarCorrida,
  asientoCuadra,
  acumuladosDesde,
  parametrosDesdeFilas,
  trimestreYVencimiento,
  ACUMULADOS_CERO,
  type EmpleadoNomina,
  type ParamsNomina,
} from "../lib/nomina";

const params: ParamsNomina = {
  ss_tasa: 0.062,
  ss_tope: 184500,
  medicare_tasa: 0.0145,
  medicare_adic_tasa: 0.009,
  medicare_adic_umbral: 200000,
  futa_tasa_bruta: 0.06,
  futa_credito: 0.054,
  futa_tope: 7000,
  sinot_emp_tasa: 0.003,
  sinot_pat_tasa: 0.003,
  sinot_tope: 9000,
  suta_tope: 7000,
  suta_tasa_default: 0.0165,
  choferil_semanal: 0.5,
  ot_multiplo: 1.5,
  exencion_personal: 3500,
  exencion_compartida: 1750,
  dependiente_regular: 2500,
  deduccion_allowance: 500,
  veterano_allowances: 3,
};
// Tramos PR individuo (mismos de la migración 0144)
const tramos = [
  { desde: 0, tasa: 0 },
  { desde: 9000, tasa: 0.07 },
  { desde: 25000, tasa: 0.14 },
  { desde: 41500, tasa: 0.25 },
  { desde: 61500, tasa: 0.33 },
];

const base: EmpleadoNomina = {
  id: "e1",
  nombre: "Ana",
  frecuencia: "quincenal",
  tipoPago: "salario",
  tarifa: 2000,
  estadoCivil: "soltero",
  exencionPersonal: "completa",
  dependientes: 0,
  allowancesDeduccion: 0,
  veterano: false,
  deduccionEspecial: false,
  retencionAdicional: 0,
  deduccionMedico: 0,
  aporte401k: 0,
  esChofer: false,
};
const cfg = { sutaTasa: 0.02, cfseTasa: 0.025, futaAplica: true };

// 0) Fórmula de Hacienda de la tabla del CPA (Héctor)
{
  // $2,000 quincenal = 48,000/año. 2 dependientes (5,000) + 2 allowances (1,000) + veterano (+3 = 1,500)
  // + deducción especial (anual > 36,500 -> 0). Base: 48,000 - 3,500 - 0 - 5,000 - 2,500 = 37,000
  //  -> 1120 + (37000-25000)*.14 = 1120 + 1680 = 2800 -> /24 = 116.67
  const e = { ...base, dependientes: 2, allowancesDeduccion: 2, veterano: true, deduccionEspecial: true };
  const l = calcularEmpleado(e, {}, ACUMULADOS_CERO, params, tramos, cfg);
  assert.equal(l.hacienda, 116.67);
  // Custodia compartida cuenta 0.5: 1 dependiente y medio = 3,750
  const h = calcularEmpleado({ ...base, dependientes: 1.5 }, {}, ACUMULADOS_CERO, params, tramos, cfg);
  // 48,000 - 3,500 - 3,750 = 40,750 -> 1120 + (40750-25000)*.14 = 1120 + 2205 = 3325 -> /24 = 138.54
  assert.equal(h.hacienda, 138.54);
  // Deducción especial según escala: salario anual 30,000 (1,250 quincenal) -> especial 1,000
  const a = calcularEmpleado({ ...base, tarifa: 1250, deduccionEspecial: true }, {}, ACUMULADOS_CERO, params, tramos, cfg);
  // 30,000 - 3,500 - 1,000 = 25,500 -> 1120 + 500*.14 = 1190 -> /24 = 49.58
  assert.equal(a.hacienda, 49.58);
  // Retención adicional fija se suma
  const x = calcularEmpleado({ ...base, retencionAdicional: 10 }, {}, ACUMULADOS_CERO, params, tramos, cfg);
  assert.equal(x.hacienda, 184.17);
}

// 1) Caso base: $2,000 quincenal, soltero, exención completa
{
  const l = calcularEmpleado(base, {}, ACUMULADOS_CERO, params, tramos, cfg);
  assert.equal(l.bruto, 2000);
  assert.equal(l.ssEmp, 124); // 6.2%
  assert.equal(l.medicareEmp, 29); // 1.45%
  assert.equal(l.medicareAdic, 0);
  // Anual 48,000 - 3,500 = 44,500 -> 0 + (25000-9000)*.07 + (41500-25000)*.14 + (44500-41500)*.25
  //   = 1120 + 2310 + 750 = 4180 -> /24 = 174.1666... -> 174.17
  assert.equal(l.hacienda, 174.17);
  assert.equal(l.sinotEmp, 6); // 0.3% de 2000
  assert.equal(l.neto, r(2000 - 124 - 29 - 174.17 - 6));
  assert.equal(l.ssPat, 124);
  assert.equal(l.medicarePat, 29);
  assert.equal(l.futa, 12); // 0.6% de 2000 (< 7000)
  assert.equal(l.suta, 40); // 2% de 2000
  assert.equal(l.cfse, 50); // 2.5%
}

// 2) Tope de Seguro Social: ya acumulado 183,000, periodo de 2,000 -> solo 1,500 sujetos
{
  const l = calcularEmpleado(base, {}, { bruto: 183000, sinotBase: 9000, sutaBase: 7000, futaBase: 7000 }, params, tramos, cfg);
  assert.equal(l.baseSs, 1500);
  assert.equal(l.ssEmp, 93);
  assert.equal(l.sinotEmp, 0); // tope SINOT ya consumido
  assert.equal(l.suta, 0);
  assert.equal(l.futa, 0);
  assert.equal(l.medicareEmp, 29); // Medicare no tiene tope
}

// 3) Medicare adicional solo sobre el exceso de $200,000
{
  const l = calcularEmpleado({ ...base, tarifa: 10000 }, {}, { bruto: 195000, sinotBase: 9000, sutaBase: 7000, futaBase: 7000 }, params, tramos, cfg);
  // 195,000 + 10,000 = 205,000 -> exceso 5,000 * 0.9% = 45
  assert.equal(l.medicareAdic, 45);
  assert.equal(l.baseSs, 0); // ya pasó el tope de SS
}

// 4) Tope parcial de SUTA/FUTA en el periodo que cruza los $7,000
{
  const l = calcularEmpleado(base, {}, { bruto: 6000, sinotBase: 6000, sutaBase: 6000, futaBase: 6000 }, params, tramos, cfg);
  assert.equal(l.baseSuta, 1000);
  assert.equal(l.suta, 20);
  assert.equal(l.futa, 6); // 0.6% de 1000
  assert.equal(l.baseSinot, 2000); // 9000 - 6000 = 3000 > 2000
}

// 5) Horas extra para empleado por hora: 80 horas a $20 + 10 extra a 1.5x
{
  const e: EmpleadoNomina = { ...base, tipoPago: "hora", tarifa: 20 };
  const l = calcularEmpleado(e, { horasRegulares: 80, horasExtra: 10 }, ACUMULADOS_CERO, params, tramos, cfg);
  assert.equal(l.desglose.regular, 1600);
  assert.equal(l.desglose.extra, 300);
  assert.equal(l.bruto, 1900);
}

// 6) Dependientes y 401(k) reducen la retención de Hacienda
{
  const sin = calcularEmpleado(base, {}, ACUMULADOS_CERO, params, tramos, cfg);
  const con = calcularEmpleado({ ...base, dependientes: 2, aporte401k: 100 }, {}, ACUMULADOS_CERO, params, tramos, cfg);
  assert.ok(con.hacienda < sin.hacienda);
  assert.equal(con.aporte401k, 100);
  assert.equal(con.neto, r(con.bruto - con.ssEmp - con.medicareEmp - con.hacienda - con.sinotEmp - 100));
}

// 7) Chofer: $0.50 semanal prorrateado a quincenal = 0.5*52/24 = 1.08
{
  const l = calcularEmpleado({ ...base, esChofer: true }, {}, ACUMULADOS_CERO, params, tramos, cfg);
  assert.equal(l.choferil, 1.08);
  assert.ok(l.advertencias.some((a) => a.includes("chofer")));
}

// 8) Sin tasa SUTA/CFSE configuradas: usa default y avisa
{
  const l = calcularEmpleado(base, {}, ACUMULADOS_CERO, params, tramos, { sutaTasa: null, cfseTasa: null, futaAplica: true });
  assert.equal(l.suta, 33); // 1.65% de 2000
  assert.equal(l.cfse, 0);
  assert.ok(l.advertencias.some((a) => a.includes("SUTA")));
  assert.ok(l.advertencias.some((a) => a.includes("CFSE")));
}

// 9) Consolidado: el asiento cuadra y los depósitos suman bien
{
  const a = calcularEmpleado(base, {}, ACUMULADOS_CERO, params, tramos, cfg);
  const b = calcularEmpleado({ ...base, id: "e2", nombre: "Luis", tarifa: 3500, aporte401k: 50, deduccionMedico: 75 }, { bonos: 200 }, ACUMULADOS_CERO, params, tramos, cfg);
  const r1 = consolidarCorrida([a, b]);
  assert.ok(asientoCuadra(r1.asiento), "el asiento debe cuadrar");
  assert.equal(r1.totales.bruto, r(a.bruto + b.bruto));
  assert.equal(r1.depositos.irs941, r(a.ssEmp + a.medicareEmp + a.ssPat + a.medicarePat + b.ssEmp + b.medicareEmp + b.ssPat + b.medicarePat));
  assert.equal(r1.depositos.hacienda499R1B, r(a.hacienda + b.hacienda));
  assert.equal(r1.totales.costoTotalPatrono, r(r1.totales.bruto + r1.totales.contribucionesPatronales));
}

// 10) Acumulados y parámetros
{
  const y = acumuladosDesde({ bruto: 1000 }, [{ bruto: 2000, base_sinot: 2000, base_suta: 2000, base_futa: 2000 }]);
  assert.deepEqual(y, { bruto: 3000, sinotBase: 2000, sutaBase: 2000, futaBase: 2000 });
  const p = parametrosDesdeFilas(
    [
      { jurisdiccion: "pr", anio: 2025, clave: "suta_tope", valor: 7000, por_confirmar: true },
      { jurisdiccion: "pr", anio: 2026, clave: "suta_tope", valor: 7500, por_confirmar: false },
      { jurisdiccion: "pr", anio: 2027, clave: "suta_tope", valor: 9999, por_confirmar: false },
    ],
    2026
  );
  assert.equal(p.valores.suta_tope, 7500);
  assert.deepEqual(p.porConfirmar, []);
}

// 11) Faltan parámetros -> error claro
{
  assert.throws(() => calcularEmpleado(base, {}, ACUMULADOS_CERO, {}, tramos, cfg), /Faltan parámetros/);
}

// 12) Vencimiento estimado
{
  assert.deepEqual(trimestreYVencimiento("2026-11-15"), { trimestre: "T4 2026", vence: "2027-01-31" });
  assert.deepEqual(trimestreYVencimiento("2026-02-10"), { trimestre: "T1 2026", vence: "2026-04-30" });
}

function r(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

console.log("nomina: todas las pruebas pasaron");
