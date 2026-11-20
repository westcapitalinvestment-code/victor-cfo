"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import { aHoraPR, type TradeEvaluado } from "@/lib/trading";

// Pestaña Estadísticas (19 nov 2026, pedido de Joel: "qué par va mejor, a qué
// hora, qué TF… las cosas que tienen los grandes"). Todo sale de los trades ya
// evaluados (con el filtro de mes del panel). Horas y días en hora de Puerto
// Rico. TF y setup los etiqueta el usuario en cada trade de la Bitácora.

type Etiquetas = Map<string, { tf: string | null; setup: string | null }>;
type Fila = { clave: string; n: number; ganados: number; neto: number; brutoG: number; brutoP: number };

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function sesion(h: number): string {
  if (h >= 19 || h < 3) return "Asia (7pm–3am)";
  if (h < 8) return "Londres (3–8am)";
  if (h < 12) return "Londres + Nueva York (8am–12pm)";
  if (h < 16) return "Nueva York tarde (12–4pm)";
  return "Cierre (4–7pm)";
}

function duracion(s: number): string {
  if (s < 60) return "< 1 min";
  if (s < 300) return "1–5 min";
  if (s < 900) return "5–15 min";
  if (s < 3600) return "15–60 min";
  if (s < 4 * 3600) return "1–4 h";
  if (s < 24 * 3600) return "4–24 h";
  return "Más de 1 día";
}

function agrupar(lista: TradeEvaluado[], clave: (t: TradeEvaluado) => string | null): Fila[] {
  const m = new Map<string, Fila>();
  for (const t of lista) {
    const k = clave(t);
    if (!k) continue;
    const f = m.get(k) ?? { clave: k, n: 0, ganados: 0, neto: 0, brutoG: 0, brutoP: 0 };
    f.n++;
    f.neto += t.neto;
    if (t.neto > 0) {
      f.ganados++;
      f.brutoG += t.neto;
    } else f.brutoP += -t.neto;
    m.set(k, f);
  }
  return [...m.values()];
}

function Tabla({ titulo, filas, orden = "neto", nota }: { titulo: string; filas: Fila[]; orden?: "neto" | "natural"; nota?: string }) {
  const lista = orden === "neto" ? [...filas].sort((a, b) => b.neto - a.neto) : filas;
  const max = Math.max(1, ...lista.map((f) => Math.abs(f.neto)));
  if (!lista.length) return null;
  return (
    <div className="vc-card !p-3">
      <p className="mb-2 text-sm uppercase tracking-wide text-muted">{titulo}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1 font-normal"> </th>
              <th className="py-1 text-right font-normal">Trades</th>
              <th className="py-1 text-right font-normal">Aciertos</th>
              <th className="py-1 text-right font-normal">Factor</th>
              <th className="py-1 text-right font-normal">Promedio</th>
              <th className="w-[38%] py-1 pl-3 font-normal">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((f) => {
              const factor = f.brutoP > 0 ? (f.brutoG / f.brutoP).toFixed(2) : f.brutoG > 0 ? "∞" : "—";
              const w = (Math.abs(f.neto) / max) * 100;
              return (
                <tr key={f.clave} className="border-t border-border">
                  <td className="py-1.5 pr-2 font-medium">{f.clave}</td>
                  <td className="py-1.5 text-right">{f.n}</td>
                  <td className="py-1.5 text-right">{Math.round((f.ganados / f.n) * 100)}%</td>
                  <td className="py-1.5 text-right">{factor}</td>
                  <td className={`py-1.5 text-right ${f.neto / f.n >= 0 ? "text-teal" : "text-red"}`}>{formatMoney(f.neto / f.n)}</td>
                  <td className="py-1.5 pl-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                        <div className={`h-full ${f.neto >= 0 ? "bg-teal" : "bg-red"}`} style={{ width: `${w}%` }} />
                      </div>
                      <span className={`w-20 text-right ${f.neto >= 0 ? "text-teal" : "text-red"}`}>{formatMoney(f.neto)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {nota && <p className="mt-2 text-[12px] text-muted">{nota}</p>}
    </div>
  );
}

function HorasBarras({ filas }: { filas: Fila[] }) {
  const porHora = new Map(filas.map((f) => [Number(f.clave), f]));
  const max = Math.max(1, ...filas.map((f) => Math.abs(f.neto)));
  const [hover, setHover] = useState<number | null>(null);
  const h = hover !== null ? porHora.get(hover) : null;
  return (
    <div className="vc-card !p-3">
      <div className="mb-2 flex justify-between text-sm">
        <span className="uppercase tracking-wide text-muted">Por hora de entrada (hora de PR)</span>
        <span className="text-muted">
          {hover !== null ? (h ? `${hover}:00 · ${h.n} trades · ${Math.round((h.ganados / h.n) * 100)}% · ${formatMoney(h.neto)}` : `${hover}:00 · sin trades`) : "Pasa por una barra"}
        </span>
      </div>
      <div className="flex h-32 items-center gap-[2px]" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: 24 }, (_, i) => {
          const f = porHora.get(i);
          const alto = f ? Math.max(3, (Math.abs(f.neto) / max) * 50) : 0;
          return (
            <div key={i} className="flex h-full flex-1 cursor-default flex-col justify-center" onMouseEnter={() => setHover(i)}>
              <div className="flex h-1/2 items-end">{f && f.neto >= 0 && <div className="w-full rounded-t bg-teal" style={{ height: `${alto * 2}%` }} />}</div>
              <div className="flex h-1/2 items-start border-t border-border">{f && f.neto < 0 && <div className="w-full rounded-b bg-red" style={{ height: `${alto * 2}%` }} />}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>12am</span>
        <span>6am</span>
        <span>12pm</span>
        <span>6pm</span>
        <span>11pm</span>
      </div>
    </div>
  );
}

export default function Estadisticas({ trades, etiquetas }: { trades: TradeEvaluado[]; etiquetas: Etiquetas }) {
  const s = useMemo(() => {
    const hora = (t: TradeEvaluado) => Number(aHoraPR(t.hora_apertura).slice(11, 13));
    const diaSem = (t: TradeEvaluado) => new Date(aHoraPR(t.hora_apertura).slice(0, 10) + "T12:00:00Z").getUTCDay();
    const g = trades.filter((t) => t.neto > 0);
    const p = trades.filter((t) => t.neto <= 0);
    const promG = g.length ? g.reduce((a, t) => a + t.neto, 0) / g.length : 0;
    const promP = p.length ? p.reduce((a, t) => a + t.neto, 0) / p.length : 0;
    const winRate = trades.length ? g.length / trades.length : 0;
    let rachaG = 0, rachaP = 0, cg = 0, cp = 0;
    for (const t of [...trades].sort((a, b) => (a.hora_apertura < b.hora_apertura ? -1 : 1))) {
      if (t.neto > 0) { cg++; cp = 0; } else { cp++; cg = 0; }
      rachaG = Math.max(rachaG, cg);
      rachaP = Math.max(rachaP, cp);
    }
    const diasF = agrupar(trades, (t) => String(diaSem(t)));
    const orden = [1, 2, 3, 4, 5, 6, 0];
    return {
      simbolo: agrupar(trades, (t) => t.simbolo),
      lado: agrupar(trades, (t) => (t.lado === "buy" ? "Compras" : "Ventas")),
      horas: agrupar(trades, (t) => String(hora(t))),
      sesiones: agrupar(trades, (t) => sesion(hora(t))),
      dias: orden.map((d) => diasF.find((f) => f.clave === String(d))).filter((f): f is Fila => !!f).map((f) => ({ ...f, clave: DIAS[Number(f.clave)] })),
      duracion: agrupar(trades, (t) => duracion(t.duracionSeg)),
      tf: agrupar(trades, (t) => etiquetas.get(t.ticket)?.tf ?? null),
      setup: agrupar(trades, (t) => etiquetas.get(t.ticket)?.setup ?? null),
      reglas: agrupar(trades, (t) => (t.violaciones.length ? "Rompiendo alguna regla" : "Cumpliendo todas")),
      promG,
      promP,
      winRate,
      expectativa: trades.length ? trades.reduce((a, t) => a + t.neto, 0) / trades.length : 0,
      rachaG,
      rachaP,
      mejor: trades.reduce<TradeEvaluado | null>((m, t) => (!m || t.neto > m.neto ? t : m), null),
      peor: trades.reduce<TradeEvaluado | null>((m, t) => (!m || t.neto < m.neto ? t : m), null),
    };
  }, [trades, etiquetas]);

  if (!trades.length) return <div className="vc-card text-center text-sm text-muted">Todavía no hay trades en este período.</div>;

  // Lo más útil arriba, en palabras (solo grupos con 3 trades o más).
  const confiable = (f: Fila[]) => f.filter((x) => x.n >= 3).sort((a, b) => b.neto - a.neto);
  const ideas: string[] = [];
  const sim = confiable(s.simbolo);
  if (sim.length >= 2) ideas.push(`Tu mejor activo es ${sim[0].clave} (${formatMoney(sim[0].neto)}); el que más te cuesta, ${sim[sim.length - 1].clave} (${formatMoney(sim[sim.length - 1].neto)}).`);
  const ses = confiable(s.sesiones);
  if (ses.length >= 2) ideas.push(`Te va mejor en ${ses[0].clave} y peor en ${ses[ses.length - 1].clave}.`);
  const dia = confiable(s.dias);
  if (dia.length >= 2) ideas.push(`Tu mejor día es el ${dia[0].clave.toLowerCase()} y el peor, el ${dia[dia.length - 1].clave.toLowerCase()}.`);
  const reg = s.reglas;
  const rompe = reg.find((r) => r.clave.startsWith("Rompiendo"));
  const cumple = reg.find((r) => r.clave.startsWith("Cumpliendo"));
  if (rompe && cumple && rompe.n >= 2) ideas.push(`Cuando cumples tus reglas promedias ${formatMoney(cumple.neto / cumple.n)} por trade; cuando las rompes, ${formatMoney(rompe.neto / rompe.n)}.`);
  const ratio = s.promP < 0 ? s.promG / -s.promP : 0;

  const tarjetas: [string, string, string?][] = [
    ["Ganancia promedio", formatMoney(s.promG), "text-teal"],
    ["Pérdida promedio", formatMoney(s.promP), "text-red"],
    ["Ganancia / pérdida", ratio ? `${ratio.toFixed(2)} a 1` : "—"],
    ["Expectativa por trade", formatMoney(s.expectativa), s.expectativa >= 0 ? "text-teal" : "text-red"],
    ["Mejor racha ganadora", `${s.rachaG}`],
    ["Peor racha perdedora", `${s.rachaP}`],
    ["Mejor trade", s.mejor ? `${formatMoney(s.mejor.neto)} · ${s.mejor.simbolo}` : "—", "text-teal"],
    ["Peor trade", s.peor ? `${formatMoney(s.peor.neto)} · ${s.peor.simbolo}` : "—", "text-red"],
  ];

  return (
    <div className="flex flex-col gap-3">
      {ideas.length > 0 && (
        <div className="vc-card !p-3">
          <p className="mb-1 text-sm uppercase tracking-wide text-muted">Lo que dicen tus números</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px]">
            {ideas.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tarjetas.map(([k, v, c]) => (
          <div key={k} className="vc-card !p-3">
            <p className="text-[12px] uppercase tracking-wide text-muted">{k}</p>
            <p className={`text-lg font-medium ${c ?? ""}`}>{v}</p>
          </div>
        ))}
      </div>
      <p className="text-[12px] text-muted">
        Expectativa = lo que ganas o pierdes en promedio por trade. Si es positiva y la mantienes, el sistema gana a la larga.
      </p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Tabla titulo="Por activo" filas={s.simbolo} />
        <Tabla titulo="Por sesión (hora de PR)" filas={s.sesiones} />
        <Tabla titulo="Por día de la semana" filas={s.dias} orden="natural" />
        <Tabla titulo="Compras vs ventas" filas={s.lado} />
        <Tabla titulo="Por duración del trade" filas={s.duracion} />
        <Tabla titulo="Cumpliendo vs rompiendo reglas" filas={s.reglas} />
        <Tabla titulo="Por temporalidad (TF)" filas={s.tf} nota="Pon el TF de cada trade en la Bitácora." />
        <Tabla titulo="Por setup / estrategia" filas={s.setup} nota="Ponle nombre a tu setup en cada trade de la Bitácora." />
      </div>
      <HorasBarras filas={s.horas} />
      {!s.tf.length && !s.setup.length && (
        <p className="text-center text-[13px] text-muted">
          Para ver qué temporalidad y qué setup te funcionan mejor, ponle el TF y el setup a tus trades en la Bitácora.
        </p>
      )}
    </div>
  );
}
