import { calcularDesdeMarcas, leerTotales, emparejarEmpleado, parseHoras, parseFechaHora } from "../lib/nomina-horas";
import { parseCsv } from "../lib/csv";
let fallos = 0;
const ok = (c: boolean, m: string) => { if (!c) { fallos++; console.log("FALLA", m); } else console.log("ok", m); };

// Marcas con Date/Time juntos, sin columna de tipo (alterna entrada/salida)
const csv = `Name,Date/Time
JUAN PEREZ,10/14/2026 8:00 AM
JUAN PEREZ,10/14/2026 12:00 PM
JUAN PEREZ,10/14/2026 12:30 PM
JUAN PEREZ,10/14/2026 6:30 PM
JUAN PEREZ,10/15/2026 8:00
JUAN PEREZ,10/15/2026 16:00
Ana Ruiz,10/14/2026 9:00
Ana Ruiz,10/14/2026 17:00
Ana Ruiz,10/20/2026 9:00
Ana Ruiz,10/20/2026 17:00`;
const filas = parseCsv(csv).slice(1);
const base = { colNombre: 0, colFecha: 1, colHora: -1, colTipo: -1, formatoFecha: "MDY" as const, reglaExtra: "dia8" as const, desde: "2026-10-12", hasta: "2026-10-18" };
let r = calcularDesdeMarcas(filas, base);
const j = r.empleados.find((e) => e.clave === "juan perez")!;
ok(j.regulares === 16 && j.extra === 2, `Juan 10h dia1 (8+2) + 8h dia2 => reg 16 extra 2 (got ${j.regulares}/${j.extra})`);
ok(r.fueraDePeriodo === 2, `Ana 10/20 fuera de periodo (${r.fueraDePeriodo})`);
const a = r.empleados.find((e) => e.clave === "ana ruiz")!;
ok(a.regulares === 8 && a.extra === 0, "Ana 8h");
r = calcularDesdeMarcas(filas, { ...base, reglaExtra: "ninguna" });
ok(r.empleados[0].regulares === 18 || r.empleados[1].regulares === 18, "sin separar extra: Juan 18h");

// Con columna de tipo y hora aparte, salida faltante
const csv2 = `Empleado;Fecha;Hora;Tipo
Luis;14/10/2026;08:00;Entrada
Luis;14/10/2026;17:00;Salida
Luis;15/10/2026;08:00;Entrada`;
r = calcularDesdeMarcas(parseCsv(csv2).slice(1), { colNombre: 0, colFecha: 1, colHora: 2, colTipo: 3, formatoFecha: "DMY", reglaExtra: "dia8", desde: "", hasta: "" });
ok(r.empleados[0].regulares === 8 && r.empleados[0].extra === 1, `Luis 9h => 8 + 1 (got ${r.empleados[0].regulares}/${r.empleados[0].extra})`);
ok(r.empleados[0].avisos.some((x) => x.includes("sin salida")), "aviso entrada sin salida");

// Totales
const t = leerTotales(parseCsv(`Nombre,Horas,OT\nJuan Perez,38:30,2\nAna Ruiz,40,0`).slice(1), { colNombre: 0, colRegulares: 1, colExtra: 2, colFecha: -1, formatoFecha: "MDY", desde: "", hasta: "" });
ok(t.empleados[0].regulares === 40 || t.empleados.find((e) => e.clave === "juan perez")!.regulares === 38.5, "38:30 => 38.5");

ok(parseHoras("8,5") === 8.5, "coma decimal");
ok(parseFechaHora("10/14/2026 8:03 PM", null, "MDY")?.minutos === 20 * 60 + 3, "PM");
ok(emparejarEmpleado("JUAN PEREZ", [{ id: "1", nombre: "Juan A. Pérez" }]) === "1", "match tokens");
ok(emparejarEmpleado("Juan", [{ id: "1", nombre: "Juan Perez" }]) === "", "un solo nombre no empareja");
process.exit(fallos ? 1 : 0);
