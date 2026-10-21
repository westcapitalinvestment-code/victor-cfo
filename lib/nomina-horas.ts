// Importación de horas desde el reporte de un reloj de ponche (huella, tarjeta,
// app) en CSV/Excel. Funciones puras: sin red ni base de datos.
//
// Dos formas de reporte:
//  - "totales": una fila por empleado (o por día) con horas ya sumadas.
//  - "marcas": una fila por ponche (fecha/hora, empleado, opcional entrada/salida).
//    Aquí emparejamos entrada→salida, sumamos por día y separamos horas extra.
//
// Las reglas de horas extra quedan como opción visible del usuario hasta que el
// contable confirme la regla definitiva (ver pendientes con Héctor).

import { normalizarFecha } from "./csv";

export type FormatoFecha = "MDY" | "DMY" | "YMD";
export type ReglaExtra = "ninguna" | "dia8" | "semana40";

export interface ResumenHoras {
  clave: string; // nombre normalizado (llave estable)
  nombre: string; // como viene en el reporte
  regulares: number;
  extra: number;
  dias: number;
  avisos: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function normalizarNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "8.5", "8,5", "8:30", "08:30:00" → horas decimales. null si no es número.
export function parseHoras(valor: string): number | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  const hm = v.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60 + (hm[3] ? Number(hm[3]) / 3600 : 0);
  const n = Number(v.replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) && /\d/.test(v) ? n : null;
}

// Minutos desde medianoche de un texto con hora ("8:03", "8:03 PM", "13:45:10").
export function parseMinutos(texto: string): number | null {
  const m = (texto ?? "").match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?\s*m?\.?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toLowerCase();
  if (ampm === "p" && h < 12) h += 12;
  if (ampm === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function parseFechaHora(
  fecha: string,
  hora: string | null,
  formato: FormatoFecha
): { fecha: string; minutos: number } | null {
  const f = (fecha ?? "").trim();
  if (!f) return null;
  // La fecha puede traer la hora pegada ("10/14/2026 8:03 AM").
  const soloFecha = f.split(/[T\s]/)[0];
  const iso = normalizarFecha(soloFecha, formato);
  if (!iso) return null;
  const minutos = parseMinutos(hora !== null && hora !== "" ? hora : f.slice(soloFecha.length));
  if (minutos === null) return null;
  return { fecha: iso, minutos };
}

function absMin(fecha: string, minutos: number): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 60000 + minutos;
}

function semanaClave(fecha: string): string {
  // Semana lunes–domingo identificada por su lunes.
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dow = (t.getUTCDay() + 6) % 7; // lunes=0
  t.setUTCDate(t.getUTCDate() - dow);
  return t.toISOString().slice(0, 10);
}

function esEntrada(t: string): boolean | null {
  const v = t.trim().toLowerCase();
  if (!v) return null;
  if (/^(in|entrada|ent|e\b|check.?in|c\/in|clock.?in|llegada|0)/.test(v)) return true;
  if (/^(out|salida|sal|s\b|check.?out|c\/out|clock.?out|1)/.test(v)) return false;
  return null;
}

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

export interface ConfigMarcas {
  colNombre: number;
  colFecha: number;
  colHora: number; // -1 si la hora viene dentro de la columna de fecha
  colTipo: number; // -1 si no hay columna de entrada/salida
  formatoFecha: FormatoFecha;
  reglaExtra: ReglaExtra;
  desde: string; // YYYY-MM-DD ("" = sin filtro)
  hasta: string;
}

export interface ResultadoLectura {
  empleados: ResumenHoras[];
  filasLeidas: number;
  filasIgnoradas: number; // sin nombre/fecha válida
  fueraDePeriodo: number;
}

export function calcularDesdeMarcas(filas: string[][], cfg: ConfigMarcas): ResultadoLectura {
  const porEmp = new Map<string, { nombre: string; marcas: { abs: number; fecha: string; entrada: boolean | null }[] }>();
  let ignoradas = 0;
  let fuera = 0;
  let leidas = 0;

  for (const f of filas) {
    const nombre = (f[cfg.colNombre] ?? "").trim();
    const fh = parseFechaHora(f[cfg.colFecha] ?? "", cfg.colHora >= 0 ? (f[cfg.colHora] ?? "") : null, cfg.formatoFecha);
    if (!nombre || !fh) {
      ignoradas++;
      continue;
    }
    if ((cfg.desde && fh.fecha < cfg.desde) || (cfg.hasta && fh.fecha > cfg.hasta)) {
      fuera++;
      continue;
    }
    leidas++;
    const clave = normalizarNombre(nombre);
    const e = porEmp.get(clave) ?? { nombre, marcas: [] };
    e.marcas.push({
      abs: absMin(fh.fecha, fh.minutos),
      fecha: fh.fecha,
      entrada: cfg.colTipo >= 0 ? esEntrada(f[cfg.colTipo] ?? "") : null,
    });
    porEmp.set(clave, e);
  }

  const empleados: ResumenHoras[] = [];
  for (const [clave, e] of porEmp) {
    const avisos: string[] = [];
    const marcas = e.marcas.sort((a, b) => a.abs - b.abs);
    const horasPorDia = new Map<string, number>();
    const usaTipo = cfg.colTipo >= 0 && marcas.every((m) => m.entrada !== null);

    let abierta: { abs: number; fecha: string } | null = null;
    const cerrar = (salidaAbs: number) => {
      if (!abierta) return;
      const mins = salidaAbs - abierta.abs;
      if (mins <= 0 || mins > 16 * 60) {
        avisos.push(`${fechaCorta(abierta.fecha)}: turno de ${r2(mins / 60)} h descartado (revísalo)`);
      } else {
        horasPorDia.set(abierta.fecha, (horasPorDia.get(abierta.fecha) ?? 0) + mins / 60);
      }
      abierta = null;
    };

    marcas.forEach((m, i) => {
      const esIn = usaTipo ? m.entrada === true : abierta === null;
      if (esIn) {
        if (abierta) {
          avisos.push(`${fechaCorta(abierta.fecha)}: entrada sin salida`);
        }
        abierta = { abs: m.abs, fecha: m.fecha };
      } else if (abierta) {
        cerrar(m.abs);
      } else {
        avisos.push(`${fechaCorta(m.fecha)}: salida sin entrada`);
      }
      if (i === marcas.length - 1 && abierta) {
        avisos.push(`${fechaCorta((abierta as { fecha: string }).fecha)}: entrada sin salida`);
      }
    });

    let regulares = 0;
    let extra = 0;
    if (cfg.reglaExtra === "dia8") {
      for (const h of horasPorDia.values()) {
        extra += Math.max(0, h - 8);
        regulares += Math.min(h, 8);
      }
    } else if (cfg.reglaExtra === "semana40") {
      const semanas = new Map<string, number>();
      for (const [d, h] of horasPorDia) semanas.set(semanaClave(d), (semanas.get(semanaClave(d)) ?? 0) + h);
      for (const h of semanas.values()) {
        extra += Math.max(0, h - 40);
        regulares += Math.min(h, 40);
      }
    } else {
      for (const h of horasPorDia.values()) regulares += h;
    }

    empleados.push({
      clave,
      nombre: e.nombre,
      regulares: r2(regulares),
      extra: r2(extra),
      dias: horasPorDia.size,
      avisos,
    });
  }
  empleados.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { empleados, filasLeidas: leidas, filasIgnoradas: ignoradas, fueraDePeriodo: fuera };
}

export interface ConfigTotales {
  colNombre: number;
  colRegulares: number;
  colExtra: number; // -1 si el reporte trae una sola columna de horas
  colFecha: number; // -1 si no hay fecha por fila
  formatoFecha: FormatoFecha;
  desde: string;
  hasta: string;
}

export function leerTotales(filas: string[][], cfg: ConfigTotales): ResultadoLectura {
  const mapa = new Map<string, ResumenHoras>();
  let ignoradas = 0;
  let fuera = 0;
  let leidas = 0;
  for (const f of filas) {
    const nombre = (f[cfg.colNombre] ?? "").trim();
    const reg = parseHoras(f[cfg.colRegulares] ?? "");
    if (!nombre || reg === null) {
      ignoradas++;
      continue;
    }
    if (cfg.colFecha >= 0 && (cfg.desde || cfg.hasta)) {
      const d = normalizarFecha((f[cfg.colFecha] ?? "").trim().split(/[T\s]/)[0], cfg.formatoFecha);
      if (d && ((cfg.desde && d < cfg.desde) || (cfg.hasta && d > cfg.hasta))) {
        fuera++;
        continue;
      }
    }
    const ext = cfg.colExtra >= 0 ? (parseHoras(f[cfg.colExtra] ?? "") ?? 0) : 0;
    leidas++;
    const clave = normalizarNombre(nombre);
    const e = mapa.get(clave) ?? { clave, nombre, regulares: 0, extra: 0, dias: 0, avisos: [] };
    e.regulares = r2(e.regulares + reg);
    e.extra = r2(e.extra + ext);
    e.dias++;
    mapa.set(clave, e);
  }
  const empleados = [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { empleados, filasLeidas: leidas, filasIgnoradas: ignoradas, fueraDePeriodo: fuera };
}

// Empareja un nombre del reloj con un empleado de VICTOR. Devuelve el id o "".
export function emparejarEmpleado(nombreReloj: string, empleados: { id: string; nombre: string }[]): string {
  const n = normalizarNombre(nombreReloj);
  if (!n) return "";
  const exacto = empleados.filter((e) => normalizarNombre(e.nombre) === n);
  if (exacto.length === 1) return exacto[0].id;
  const tr = new Set(n.split(" "));
  const candidatos = empleados.filter((e) => {
    const te = new Set(normalizarNombre(e.nombre).split(" "));
    const [chico, grande] = tr.size <= te.size ? [tr, te] : [te, tr];
    return chico.size >= 2 && [...chico].every((t) => grande.has(t));
  });
  return candidatos.length === 1 ? candidatos[0].id : "";
}

// Sugiere columnas según los encabezados del reporte.
export function adivinarColumnas(encabezados: string[]) {
  const buscar = (re: RegExp) => encabezados.findIndex((h) => re.test(h.toLowerCase()));
  return {
    nombre: buscar(/nombre|name|empleado|employee|persona|user/),
    fecha: buscar(/fecha|date|d[ií]a|day|time|tiempo/),
    hora: buscar(/^hora$|^time$|^hora de|punch time/),
    tipo: buscar(/tipo|type|estado|status|in\/out|entrada\/salida|punch/),
    regulares: buscar(/regular|total|horas|hours|hrs/),
    extra: buscar(/extra|overtime|\bot\b/),
  };
}

// Primera fila con al menos 2 celdas llenas = encabezados (los reportes de
// relojes suelen traer título y fechas arriba).
export function filaEncabezados(filas: string[][]): number {
  const i = filas.findIndex((f) => f.filter((c) => c.trim()).length >= 2);
  return i < 0 ? 0 : i;
}
