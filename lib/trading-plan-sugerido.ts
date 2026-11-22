// Plan de reglas sugerido (21 nov 2026, pedido de Joel): para quien llega a
// Trading SIN reglas. Contesta un cuestionario corto y VICTOR le arma un
// punto de partida con la lógica que usan las prop firms (riesgo fijo y
// pequeño por trade, tope de pérdida diaria, drawdown máximo, pausa tras
// perder). No es asesoría ni promete resultados: son límites para proteger
// el capital, que el cliente puede ajustar. Funciones puras, sin red.

import type { ReglasRiesgo } from "./trading";

export type Experiencia = "nuevo" | "menos1" | "mas1";
export type Estilo = "scalping" | "intradia" | "swing";
export type Problema = "revancha" | "sobreoperar" | "sin_stop" | "mover_stop";
export type Objetivo = "proteger" | "crecer" | "fondearme";

export type RespuestasPlan = {
  capital: number;
  experiencia: Experiencia;
  estilo: Estilo;
  problemas: Problema[];
  objetivo: Objetivo;
};

export type PlanSugerido = {
  reglas: ReglasRiesgo;
  // Campos del guardián que el plan también llena.
  perdidaDiaUSD: number;
  riesgoTradeUSD: number;
  drawdownPct: number;
  equityMinimaUSD: number;
  diasMalosHastaTope: number;
  checklist: string[];
  razones: string[];
};

const redondear = (n: number) => Math.floor(n * 100) / 100;

export function armarPlan(r: RespuestasPlan): PlanSugerido {
  const capital = Math.max(0, r.capital);
  const revancha = r.problemas.includes("revancha");
  const sobreopera = r.problemas.includes("sobreoperar");
  const razones: string[] = [];

  // Riesgo por trade: menos cuando empiezas o quieres proteger.
  let riesgoPct = r.experiencia === "nuevo" ? 0.5 : r.experiencia === "menos1" ? 0.75 : 1;
  if (r.objetivo === "proteger") riesgoPct = Math.min(riesgoPct, 0.5);
  razones.push(
    riesgoPct <= 0.5
      ? "Arriesgas 0.5% por trade: aguantas muchas pérdidas seguidas sin dañar la cuenta mientras aprendes."
      : `Arriesgas ${riesgoPct}% por trade, cerca del 1% que usan las prop firms.`
  );

  // Pérdidas permitidas al día.
  const perdedores = revancha ? 2 : 3;
  if (revancha) razones.push("Solo 2 pérdidas al día: la revancha se corta antes de que empiece.");

  const perdidaDiaPct = Math.round(riesgoPct * perdedores * 100) / 100;

  // Trades al día según cómo opera.
  let maxTrades = r.estilo === "scalping" ? 6 : r.estilo === "intradia" ? 4 : 2;
  if (sobreopera) {
    maxTrades = Math.max(2, maxTrades - 2);
    razones.push(`Máximo ${maxTrades} trades al día para que no operes de más.`);
  }

  // Pausa después de perder.
  const espera = revancha ? 60 : r.estilo === "swing" ? 0 : 20;
  if (revancha) razones.push("Esperas 60 minutos después de una pérdida antes de volver a entrar.");

  // Drawdown máximo de la cuenta (como el de una evaluación).
  const drawdownPct = r.objetivo === "proteger" || r.experiencia === "nuevo" ? 8 : 10;

  if (r.problemas.includes("sin_stop")) razones.push("Stop obligatorio: el guardián no te deja abrir sin stop.");

  const reglas: ReglasRiesgo = {
    riesgo_por_trade_pct: riesgoPct,
    max_perdedores_dia: perdedores,
    perdida_max_dia_pct: perdidaDiaPct,
    max_trades_dia: maxTrades,
    espera_tras_perdida_min: espera,
    duracion_min_seg: r.estilo === "scalping" ? 60 : 300,
    sl_obligatorio: true,
  };

  const perdidaDiaUSD = redondear((capital * perdidaDiaPct) / 100);
  const riesgoTradeUSD = perdedores > 0 ? redondear(perdidaDiaUSD / perdedores) : 0;
  const equityMinimaUSD = redondear(capital * (1 - drawdownPct / 100));
  const diasMalosHastaTope = perdidaDiaPct > 0 ? Math.floor(drawdownPct / perdidaDiaPct) : 0;

  // Checklist de entrada (✓/✗ por trade en la bitácora).
  const checklist = ["Sé dónde salgo (stop) antes de entrar", "Este trade está en mi plan"];
  if (revancha) checklist.push("No estoy entrando para recuperar una pérdida");
  if (r.problemas.includes("mover_stop")) checklist.push("No moví el stop en contra");
  if (sobreopera) checklist.push("Esperé mi setup, no entré por aburrimiento");

  if (r.objetivo === "fondearme")
    razones.push(`Drawdown máximo de ${drawdownPct}%: así practicas con los mismos límites que te pedirían para fondearte.`);

  return { reglas, perdidaDiaUSD, riesgoTradeUSD, drawdownPct, equityMinimaUSD, diasMalosHastaTope, checklist, razones };
}
