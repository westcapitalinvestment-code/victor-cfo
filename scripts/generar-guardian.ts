// Genera guardian/VictorGuard.mq5: la versión GENÉRICA del guardián (sin token ni
// reglas dentro) que se compila UNA vez en MetaEditor (F7) y se publica como
// public/descargas/VictorGuard.ex5. Uso: npx tsx scripts/generar-guardian.ts
// Cada vez que cambie lib/trading-guard.ts hay que regenerarlo y recompilarlo.
import { writeFileSync } from "fs";
import { generarGuardianMQ5 } from "../lib/trading-guard";

const src = generarGuardianMQ5({
  generico: true,
  // Valores de arranque: solo se usan hasta la primera sincronización (y sin
  // reglas de VICTOR el guardián no deja abrir trades).
  simbolos: "*",
  bloqueados: "",
  modoStop: "atr",
  stopPct: 0.5,
  atrMult: 1.5,
  atrTF: "M15",
  simboloPips: "XAUUSD",
  riesgoPct: 1,
  riesgoUSD: 0,
  distanciaPips: 60,
  tamanoPip: 0.1,
  relacionTP: 2,
  maxPerdedoresDia: 3,
  perdidaMaxDiaPct: 3,
  perdidaMaxDiaUSD: 0,
  equityMinimoPct: 80,
  equityMinimoUSD: 0,
  maxAbiertos: 1,
  maxTradesDia: 0,
  esperaTrasPerdidaMin: 0,
  modoBloqueo: "flexible",
  bloquearCierreManual: true,
});
writeFileSync(new URL("../guardian/VictorGuard.mq5", import.meta.url), src);
console.log("guardian/VictorGuard.mq5 generado");
