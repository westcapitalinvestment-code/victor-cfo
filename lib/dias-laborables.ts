// Días laborables y fechas de pago quincenal (9 nov 2026, pedido de Joel:
// "lo mío es automatizar lo más que se pueda").
//
// Regla del programa de vendedores (Kit y Contrato): se paga el día 15 y el
// último día de cada mes; si cae en fin de semana o feriado, se paga el
// próximo día laborable. Los feriados son los de la Reserva Federal, que
// son los que rigen las transferencias ACH (si el feriado cae domingo, se
// observa el lunes; si cae sábado, la Reserva Federal no lo mueve).
//
// Funciones puras, sin dependencias de servidor: se usan igual en el
// portal del vendedor, el panel de Ventas y el módulo de Pagos.

const MS_DIA = 86_400_000;
const aUTC = (iso: string) => new Date(`${iso}T00:00:00Z`);
const aISO = (d: Date) => d.toISOString().slice(0, 10);

export function sumarDias(iso: string, n: number): string {
  return aISO(new Date(aUTC(iso).getTime() + n * MS_DIA));
}

export function ultimoDiaDelMes(anio: number, mes1a12: number): string {
  return aISO(new Date(Date.UTC(anio, mes1a12, 0)));
}

// n-ésimo día de la semana del mes (n=-1 = el último). diaSemana: 0=domingo.
function enesimoDiaSemana(anio: number, mes1a12: number, diaSemana: number, n: number): string {
  if (n > 0) {
    const primero = new Date(Date.UTC(anio, mes1a12 - 1, 1));
    const delta = (diaSemana - primero.getUTCDay() + 7) % 7;
    return aISO(new Date(Date.UTC(anio, mes1a12 - 1, 1 + delta + (n - 1) * 7)));
  }
  const ultimo = new Date(Date.UTC(anio, mes1a12, 0));
  const delta = (ultimo.getUTCDay() - diaSemana + 7) % 7;
  return aISO(new Date(Date.UTC(anio, mes1a12 - 1, ultimo.getUTCDate() - delta)));
}

const cacheFeriados = new Map<number, Set<string>>();

export function feriadosBancarios(anio: number): Set<string> {
  const enCache = cacheFeriados.get(anio);
  if (enCache) return enCache;
  const fijo = (mes: number, dia: number) => {
    const iso = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    // Domingo → se observa el lunes.
    return aUTC(iso).getUTCDay() === 0 ? sumarDias(iso, 1) : iso;
  };
  const set = new Set<string>([
    fijo(1, 1), // Año Nuevo
    enesimoDiaSemana(anio, 1, 1, 3), // Martin Luther King Jr.
    enesimoDiaSemana(anio, 2, 1, 3), // Día de los Presidentes
    enesimoDiaSemana(anio, 5, 1, -1), // Memorial Day
    fijo(6, 19), // Juneteenth
    fijo(7, 4), // Independencia
    enesimoDiaSemana(anio, 9, 1, 1), // Día del Trabajo
    enesimoDiaSemana(anio, 10, 1, 2), // Día de la Raza
    fijo(11, 11), // Día del Veterano
    enesimoDiaSemana(anio, 11, 4, 4), // Acción de Gracias
    fijo(12, 25), // Navidad
  ]);
  cacheFeriados.set(anio, set);
  return set;
}

export function esDiaLaborable(iso: string): boolean {
  const dia = aUTC(iso).getUTCDay();
  if (dia === 0 || dia === 6) return false;
  return !feriadosBancarios(Number(iso.slice(0, 4))).has(iso);
}

// La misma fecha si es laborable; si no, el próximo día laborable.
export function siguienteDiaLaborable(iso: string): string {
  let d = iso;
  for (let i = 0; i < 10 && !esDiaLaborable(d); i++) d = sumarDias(d, 1);
  return d;
}

// Fechas "nominales" de pago de un mes: 15 y último día (quincenal) o solo
// el último día (mensual).
function fechasBaseDelMes(anio: number, mes: number, frecuencia: "quincenal" | "mensual"): string[] {
  const fin = ultimoDiaDelMes(anio, mes);
  if (frecuencia === "mensual") return [fin];
  return [`${anio}-${String(mes).padStart(2, "0")}-15`, fin];
}

// Primera fecha de pago (ya movida a día laborable) que sea >= desde.
// Revisa desde el mes anterior porque un pago de fin de mes que cae en
// fin de semana o feriado se corre al mes siguiente.
export function proximaFechaPago(desde: string, frecuencia: "quincenal" | "mensual" = "quincenal"): string {
  let anio = Number(desde.slice(0, 4));
  let mes = Number(desde.slice(5, 7)) - 1;
  if (mes === 0) {
    mes = 12;
    anio -= 1;
  }
  for (let i = 0; i < 4; i++) {
    for (const base of fechasBaseDelMes(anio, mes, frecuencia)) {
      const real = siguienteDiaLaborable(base);
      if (real >= desde) return real;
    }
    mes += 1;
    if (mes === 13) {
      mes = 1;
      anio += 1;
    }
  }
  return siguienteDiaLaborable(desde);
}
