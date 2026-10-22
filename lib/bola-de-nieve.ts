// Bola de nieve y avalancha (22 oct 2026) — para el plan gratis. Cálculo puro: dadas las
// deudas (saldo, tasa anual, pago mínimo) y un pago extra mensual, simula mes
// a mes pagando primero la deuda de MENOR saldo; cuando una se salda, su pago
// se suma a la siguiente ("la bola rueda").

export type Metodo = "nieve" | "avalancha";

// Bola de nieve: menor saldo primero. Avalancha: mayor tasa (APR) primero.
function comparador(metodo: Metodo) {
  return (a: { saldo: number; apr: number }, b: { saldo: number; apr: number }) =>
    metodo === "avalancha" ? b.apr - a.apr || a.saldo - b.saldo : a.saldo - b.saldo;
}

export type Deuda = { id: string; nombre: string; saldo: number; apr: number; minimo: number };

export type ResultadoNieve = {
  orden: { id: string; nombre: string; mesesHastaSaldar: number }[];
  mesesTotal: number | null; // null = no se salda (mínimos no cubren los intereses) o pasa del tope
  interesTotal: number;
  mensajeError: string | null;
};

const TOPE_MESES = 600; // 50 años

export function simularBolaDeNieve(deudasIn: Deuda[], extraMensual: number, metodo: Metodo = "nieve"): ResultadoNieve {
  const deudas = deudasIn
    .filter((d) => d.saldo > 0)
    .map((d) => ({ ...d, saldo: round2(d.saldo), minimo: Math.max(0, d.minimo) }));
  if (deudas.length === 0) return { orden: [], mesesTotal: 0, interesTotal: 0, mensajeError: null };

  const presupuesto = deudas.reduce((s, d) => s + d.minimo, 0) + Math.max(0, extraMensual);
  if (presupuesto <= 0) {
    return { orden: [], mesesTotal: null, interesTotal: 0, mensajeError: "Escribe el pago mínimo de tus deudas o un pago extra." };
  }

  const orden: ResultadoNieve["orden"] = [];
  let interesTotal = 0;
  let mes = 0;
  let vivas = deudas.slice();

  while (vivas.length > 0 && mes < TOPE_MESES) {
    mes++;
    // 1) Intereses del mes.
    for (const d of vivas) {
      const interes = round2((d.saldo * (d.apr / 100)) / 12);
      d.saldo = round2(d.saldo + interes);
      interesTotal += interes;
    }
    // 2) Mínimos a todas; el resto del presupuesto va a la de menor saldo.
    let disponible = presupuesto;
    for (const d of vivas) {
      const pago = Math.min(d.minimo, d.saldo, disponible);
      d.saldo = round2(d.saldo - pago);
      disponible = round2(disponible - pago);
    }
    vivas.sort(comparador(metodo));
    for (const d of vivas) {
      if (disponible <= 0) break;
      const pago = Math.min(d.saldo, disponible);
      d.saldo = round2(d.saldo - pago);
      disponible = round2(disponible - pago);
    }
    // 3) Registrar las saldadas.
    const saldadas = vivas.filter((d) => d.saldo <= 0.005);
    for (const d of saldadas) orden.push({ id: d.id, nombre: d.nombre, mesesHastaSaldar: mes });
    vivas = vivas.filter((d) => d.saldo > 0.005);
  }

  if (vivas.length > 0) {
    return {
      orden,
      mesesTotal: null,
      interesTotal: 0,
      mensajeError: "Con ese pago los intereses se comen el abono y la deuda no baja. Sube el pago mensual.",
    };
  }
  return { orden, mesesTotal: mes, interesTotal: round2(interesTotal), mensajeError: null };
}

// Orden en que se atacarán — para mostrarlo antes de simular.
export function ordenBolaDeNieve(deudas: Deuda[], metodo: Metodo = "nieve"): Deuda[] {
  return deudas.filter((d) => d.saldo > 0).sort(comparador(metodo));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
