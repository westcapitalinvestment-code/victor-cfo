// "Tu plan" del plan gratis (22 oct 2026) — cuestionario de 4 preguntas que
// arma un camino con pasos reales. Lógica pura: sin IA, sin consultas.
//
// Alineado con la biblioteca de VICTOR (lib/victor/conocimiento-financiero.ts):
//   - Págate Primero (Clason/Bach): 10-20% antes de gastar; fondo de
//     emergencia de 3-6 meses antes de invertir; evitar deuda de consumo.
//   - El Mapa del Dinero: "Número de Supervivencia" = lo que cuesta vivir un
//     mes -> base del fondo de emergencia.
//   - Conceptos 1, 8 y 9: el 50/30/20 se adapta (empezar con lo posible),
//     patrimonio neto = activos - pasivos, flujo neto = ingresos - gastos.
//   - estrategias-financieras: con deuda y sin fondo, la liquidez va antes del
//     pago acelerado -> colchón de arranque y luego bola de nieve/avalancha.

export type Camino = "deudas" | "ordenar" | "probar";

export type Respuestas = {
  motivo: "deudas" | "ordenar" | "ahorrar" | "probar";
  deudas: "si" | "no";
  sobra: "nada" | "poco" | "si";
  fondo: "no" | "algo" | "tres";
};

export const COLCHON_ARRANQUE = 500;
export const MESES_FONDO_META = 3;

export function elegirCamino(r: Respuestas): Camino {
  if (r.motivo === "probar") return "probar";
  if (r.motivo === "deudas") return "deudas";
  if (r.deudas === "si" && r.sobra !== "si") return "deudas";
  return "ordenar";
}

export function respuestasValidas(x: unknown): x is Respuestas {
  const r = x as Respuestas | null;
  if (!r || typeof r !== "object") return false;
  return (
    ["deudas", "ordenar", "ahorrar", "probar"].includes(r.motivo) &&
    ["si", "no"].includes(r.deudas) &&
    ["nada", "poco", "si"].includes(r.sobra) &&
    ["no", "algo", "tres"].includes(r.fondo)
  );
}

export type DatosPlan = {
  tieneBalance: boolean; // ya anotó su balance de hoy (cuenta Efectivo)
  numDeudas: number;
  deudaTotal: number;
  ahorrado: number;
  inversion: number;
  balance: number; // dinero líquido (efectivo + cuentas)
  ingresosMes: number;
  gastosMes: number;
  necesidadesMes: number; // gasto de Necesidades del mes (Número de Supervivencia aproximado)
  txMes: number; // transacciones del mes
  haSubidoArchivo: boolean;
  aportesMes: number; // aportes a ahorro/inversión del mes
  pagosDeudaMes: number;
  pagosDeudaTotal: number;
};

export type Accion =
  | { tipo: "panel"; panel: "balance" | "deuda" | "ingreso" | "gasto" | "ahorro" | "inversion" }
  | { tipo: "link"; href: string };

export type Paso = {
  id: string;
  titulo: string;
  detalle: string;
  hecho: boolean;
  accion?: Accion;
  boton?: string;
  opcional?: boolean; // no cuenta para dar el plan por completado
};

export function planCompleto(p: PlanArmado): boolean {
  return p.pasos.filter((s) => !s.opcional).every((s) => s.hecho);
}

export type PlanArmado = {
  camino: Camino;
  titulo: string;
  subtitulo: string;
  pasos: Paso[];
};

export function patrimonioNeto(d: Pick<DatosPlan, "balance" | "inversion" | "deudaTotal">): number {
  return d.balance + d.inversion - d.deudaTotal;
}

export function mesesDeFondo(d: Pick<DatosPlan, "ahorrado" | "necesidadesMes">): number | null {
  if (!(d.necesidadesMes > 0)) return null;
  return d.ahorrado / d.necesidadesMes;
}

export function armarPlan(camino: Camino, r: Respuestas, d: DatosPlan): PlanArmado {
  const meses = mesesDeFondo(d);
  const fondoListo = r.fondo === "tres" || (meses !== null && meses >= MESES_FONDO_META);

  if (camino === "deudas") {
    return {
      camino,
      titulo: "Tu plan: salir de deudas",
      subtitulo:
        "Pagar una deuda con 24% de interés rinde más que casi cualquier ahorro. Primero un colchón chiquito para no volver a endeudarte, y luego atacamos las deudas una por una.",
      pasos: [
        {
          id: "balance",
          titulo: "Anota tu balance de hoy",
          detalle: "Cuánto dinero tienes hoy. Es tu punto de partida: sin él, los números se van en negativo.",
          hecho: d.tieneBalance,
          accion: { tipo: "panel", panel: "balance" },
          boton: "Anotar balance",
        },
        {
          id: "deudas",
          titulo: "Anota tus deudas",
          detalle: "Tarjetas y préstamos: nombre, saldo, tasa de interés y pago mínimo.",
          hecho: d.numDeudas > 0,
          accion: { tipo: "panel", panel: "deuda" },
          boton: "Anotar deudas",
        },
        {
          id: "colchon",
          titulo: `Colchón de arranque de $${COLCHON_ARRANQUE}`,
          detalle:
            "Un fondo mínimo para imprevistos, así una avería no termina en la tarjeta. Luego se crece hasta 3 meses de gastos básicos.",
          hecho: fondoListo || d.ahorrado >= COLCHON_ARRANQUE,
          accion: { tipo: "panel", panel: "ahorro" },
          boton: "Aportar a ahorro",
        },
        {
          id: "atacar",
          titulo: "Ataca tus deudas con bola de nieve o avalancha",
          detalle: "Mira en qué orden pagarlas y cuándo quedas libre. Cada pago que registres baja tu deuda y tu balance.",
          hecho: d.pagosDeudaTotal > 0,
          accion: { tipo: "panel", panel: "deuda" },
          boton: "Pagar una deuda",
        },
      ],
    };
  }

  if (camino === "ordenar") {
    return {
      camino,
      titulo: "Tu plan: ordenar y crecer",
      subtitulo:
        "Págate primero: separa de lo que cobras antes de gastar. Empieza con lo que puedas (10%) y sube hacia 20%. Luego el fondo de emergencia.",
      pasos: [
        {
          id: "balance",
          titulo: "Anota tu balance de hoy",
          detalle: "Cuánto dinero tienes hoy. Todo lo que anotes después se suma o se resta.",
          hecho: d.tieneBalance,
          accion: { tipo: "panel", panel: "balance" },
          boton: "Anotar balance",
        },
        {
          id: "mes",
          titulo: "Anota tus ingresos y gastos del mes",
          detalle: "O sube el CSV, Excel o PDF de tu banco desde Cuentas. Con eso se arma tu reparto 50/30/20.",
          hecho: d.ingresosMes > 0 && d.gastosMes > 0,
          accion: { tipo: "panel", panel: "ingreso" },
          boton: "Anotar un ingreso",
        },
        {
          id: "pagate",
          titulo: "Págate primero este mes",
          detalle: "Aporta a tu ahorro o inversión apenas cobres. No es lo que sobra: es lo primero que sale.",
          hecho: d.aportesMes > 0,
          accion: { tipo: "panel", panel: "ahorro" },
          boton: "Aportar ahora",
        },
        {
          id: "fondo",
          titulo: `Fondo de emergencia: ${MESES_FONDO_META} meses de lo básico`,
          detalle:
            meses === null
              ? "Cuando anotes tus gastos básicos (vivienda, comida, luz, transporte), calculo cuántos meses te cubre tu ahorro."
              : `Tu ahorro cubre ${meses.toFixed(1)} meses de tus gastos básicos de este mes.`,
          hecho: fondoListo,
          accion: { tipo: "panel", panel: "ahorro" },
          boton: "Aportar a ahorro",
        },
      ],
    };
  }

  return {
    camino,
    titulo: "Tu plan: probar VICTOR con tus números reales",
    subtitulo: "En 5 minutos ves tu dinero ordenado. Si te sirve, lo conectas al banco para que se actualice solo.",
    pasos: [
      {
        id: "archivo",
        titulo: "Sube el estado de cuenta de tu banco",
        detalle: "CSV, Excel o PDF de los últimos 2 o 3 meses. VICTOR lo ordena y calcula tus ingresos y gastos.",
        hecho: d.haSubidoArchivo || d.txMes >= 10,
        accion: { tipo: "link", href: "/dashboard/cuentas" },
        boton: "Subir estado",
      },
      {
        id: "balance",
        titulo: "Anota tu balance de hoy",
        detalle: "Así ves tu patrimonio neto: lo que tienes menos lo que debes.",
        hecho: d.tieneBalance,
        accion: { tipo: "panel", panel: "balance" },
        boton: "Anotar balance",
      },
      {
        id: "reparto",
        titulo: "Mira cómo se reparte tu mes",
        detalle: "Necesidades, gustos y ahorro frente a la regla 50/30/20, más tu flujo neto.",
        hecho: d.ingresosMes > 0 && d.gastosMes > 0,
        accion: { tipo: "link", href: "#regla-50-30-20" },
        boton: "Ver mi reparto",
      },
      {
        id: "core",
        titulo: "Conoce lo que cambia con Core",
        detalle:
          "Tu banco conectado (todo se actualiza solo) y VICTOR en el chat para preguntarle lo que quieras. Pruébalo 7 días.",
        hecho: false,
        opcional: true,
        accion: { tipo: "link", href: "/dashboard/cuentas" },
        boton: "Ver Core",
      },
    ],
  };
}

// Una línea de "qué sigue", según el orden de Págate Primero / VICTOR:
// balance -> colchón -> deudas -> fondo de 3 meses -> invertir.
export function siguientePrioridad(d: DatosPlan): { texto: string; accion?: Accion; boton?: string } {
  const meses = mesesDeFondo(d);
  if (!d.tieneBalance)
    return {
      texto: "Primero anota tu balance de hoy: es tu punto de partida.",
      accion: { tipo: "panel", panel: "balance" },
      boton: "Anotar balance",
    };
  if (d.deudaTotal > 0 && d.ahorrado < COLCHON_ARRANQUE)
    return {
      texto: `Tienes deudas y poco colchón: primero junta $${COLCHON_ARRANQUE} de arranque y luego ataca las deudas.`,
      accion: { tipo: "panel", panel: "ahorro" },
      boton: "Aportar a ahorro",
    };
  if (d.deudaTotal > 0)
    return {
      texto: "Lo que más rinde ahora: pagar tus deudas, empezando por la que cuesta más o la más chiquita.",
      accion: { tipo: "panel", panel: "deuda" },
      boton: "Pagar una deuda",
    };
  if (meses === null || meses < MESES_FONDO_META)
    return {
      texto: `Sigue tu fondo de emergencia: meta ${MESES_FONDO_META} meses de gastos básicos.`,
      accion: { tipo: "panel", panel: "ahorro" },
      boton: "Aportar a ahorro",
    };
  return {
    texto: "Ya tienes colchón y no debes tarjetas: el siguiente paso es invertir una parte cada mes, sin falta.",
    accion: { tipo: "panel", panel: "inversion" },
    boton: "Aportar a inversión",
  };
}
