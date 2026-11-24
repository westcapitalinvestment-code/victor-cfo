import type { PlanSugerido } from "./trading-plan-sugerido";

// Resumen del plan sugerido en líneas de texto (24 nov 2026): lo usan la página
// pública /trading/plan y el email que recibe quien deja su contacto.
export function lineasPlan(p: PlanSugerido): { k: string; v: string }[] {
  const r = p.reglas;
  const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return [
    { k: "Riesgo por trade", v: `${r.riesgo_por_trade_pct}% (${usd(p.riesgoTradeUSD)})` },
    { k: "Pérdida máxima del día", v: `${r.perdida_max_dia_pct}% (${usd(p.perdidaDiaUSD)}) o ${r.max_perdedores_dia} trades perdedores` },
    { k: "Trades al día", v: `máximo ${r.max_trades_dia}` },
    { k: "Pausa tras perder", v: r.espera_tras_perdida_min ? `${r.espera_tras_perdida_min} minutos` : "sin pausa" },
    { k: "Caída máxima de la cuenta", v: `${p.drawdownPct}% (si baja de ${usd(p.equityMinimaUSD)}, paras)` },
    { k: "Stop", v: "obligatorio en cada trade" },
  ];
}
