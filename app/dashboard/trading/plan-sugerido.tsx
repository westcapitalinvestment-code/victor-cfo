"use client";

import { useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/format";
import { SESIONES, TODAS_SESIONES, type Sesion } from "@/lib/trading-bloqueos";
import { DURACIONES_PRUEBA } from "./prueba-plan";
import { armarPlan, type Edad, type Estilo, type Experiencia, type Objetivo, type PlanSugerido, type Problema } from "@/lib/trading-plan-sugerido";

// Cuestionario "VICTOR te arma tu plan" (21 nov 2026, pedido de Joel): para
// quien no tiene reglas. 7 preguntas → plan con números en dólares → un toque
// para guardarlo (reglas + guardián + checklist de entrada).

type Opcion<T extends string> = { v: T; t: string };

function Chips<T extends string>({ opciones, valor, onCambio, multiple }: { opciones: Opcion<T>[]; valor: T[]; onCambio: (v: T[]) => void; multiple?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => {
        const activo = valor.includes(o.v);
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onCambio(multiple ? (activo ? valor.filter((x) => x !== o.v) : [...valor, o.v]) : [o.v])}
            className={`rounded-pill border px-3 py-1.5 text-sm ${activo ? "border-[#1B3A5C] bg-[#1B3A5C] text-white" : "border-border text-[#1B3A5C]"}`}
          >
            {o.t}
          </button>
        );
      })}
    </div>
  );
}

const EXPERIENCIA: Opcion<Experiencia>[] = [
  { v: "nuevo", t: "Estoy empezando" },
  { v: "menos1", t: "Menos de 1 año" },
  { v: "mas1", t: "Más de 1 año" },
];
const ESTILO: Opcion<Estilo>[] = [
  { v: "scalping", t: "Scalping (minutos)" },
  { v: "intradia", t: "Intradía (horas)" },
  { v: "swing", t: "Swing (días)" },
];
const PROBLEMAS: Opcion<Problema>[] = [
  { v: "revancha", t: "Revancha después de perder" },
  { v: "sobreoperar", t: "Operar de más" },
  { v: "sin_stop", t: "Entrar sin stop" },
  { v: "mover_stop", t: "Mover el stop" },
];
const OBJETIVO: Opcion<Objetivo>[] = [
  { v: "proteger", t: "Preservar mi capital" },
  { v: "crecer", t: "Crecer poco a poco" },
  { v: "rapido", t: "Crecer rápido" },
  { v: "escalar", t: "Escalar mi cuenta" },
  { v: "retiro", t: "Construir mi retiro" },
];
const SESION_OPC: Opcion<Sesion>[] = TODAS_SESIONES.map((v) => ({ v, t: SESIONES[v].nombre }));
const EDAD: Opcion<Edad>[] = [
  { v: "menos30", t: "Menos de 30" },
  { v: "30a45", t: "30 a 45" },
  { v: "45a60", t: "45 a 60" },
  { v: "mas60", t: "Más de 60" },
];

export default function PlanSugeridoCard({
  capitalInicial,
  tieneReglas,
  abierto,
  onAbrir,
  onAplicar,
}: {
  capitalInicial: number;
  tieneReglas: boolean;
  abierto: boolean;
  onAbrir: (a: boolean) => void;
  onAplicar: (plan: PlanSugerido, diasPrueba: number) => Promise<string | null>;
}) {
  const [capital, setCapital] = useState<string>(capitalInicial > 0 ? String(Math.round(capitalInicial)) : "");
  const [exp, setExp] = useState<Experiencia[]>([]);
  const [estilo, setEstilo] = useState<Estilo[]>([]);
  const [problemas, setProblemas] = useState<Problema[]>([]);
  const [objetivo, setObjetivo] = useState<Objetivo[]>([]);
  const [edad, setEdad] = useState<Edad[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [diasPrueba, setDiasPrueba] = useState<number>(14);
  const [plan, setPlan] = useState<PlanSugerido | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cap = Number(capital.replace(/[^0-9.]/g, ""));
  const completo = cap > 0 && exp.length && estilo.length && objetivo.length && edad.length;

  if (!abierto) {
    return tieneReglas ? (
      <button
        className="mb-4 flex w-full items-center justify-between gap-3 rounded-xl border border-teal/30 bg-teal/10 p-4 text-left transition hover:bg-teal/15"
        onClick={() => onAbrir(true)}
      >
        <span className="flex items-center gap-3">
          <img src="/victor-avatar.png" width={40} height={40} alt="" className="shrink-0 rounded-full bg-white" />
          <span className="flex flex-col">
            <span className="text-base font-semibold text-[#1B3A5C]">¿Quieres que VICTOR te sugiera reglas según tu perfil?</span>
            <span className="text-[14px] text-muted">7 preguntas y te arma un plan con los números para tu cuenta.</span>
          </span>
        </span>
        <span className="shrink-0 rounded-pill bg-teal px-3 py-1.5 text-sm font-medium text-white">Armar plan →</span>
      </button>
    ) : (
      <div className="vc-card mb-4 border-2 border-teal/40">
        <p className="text-sm uppercase tracking-wide text-teal">¿No tienes reglas?</p>
        <p className="mt-1 text-lg font-semibold">VICTOR te arma tu plan en 1 minuto.</p>
        <p className="mt-1 text-[14px] text-muted">Contestas 7 preguntas y te propone reglas como las de una prop firm, con los números en dólares para tu cuenta. Las puedes ajustar.</p>
        <button className="vc-btn-primary mt-3" onClick={() => onAbrir(true)}>
          Armar mi plan
        </button>
      </div>
    );
  }

  if (plan) {
    const r = plan.reglas;
    return (
      <div className="vc-card mb-4 border-2 border-teal/40">
        <p className="text-sm uppercase tracking-wide text-teal">Tu plan sugerido</p>
        <p className="mt-1 text-lg font-semibold">Con {formatMoney(cap, 0)} en tu cuenta:</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          {[
            { k: "Riesgo por trade", v: formatMoney(plan.riesgoTradeUSD), s: `${r.riesgo_por_trade_pct}%` },
            { k: "Pérdida máx. del día", v: formatMoney(plan.perdidaDiaUSD), s: `o ${r.max_perdedores_dia} pérdidas` },
            { k: "Trades al día", v: String(r.max_trades_dia), s: "máximo" },
            { k: "Si pierdes", v: r.espera_tras_perdida_min > 0 ? `${r.espera_tras_perdida_min} min` : "—", s: r.espera_tras_perdida_min > 0 ? "de pausa" : "sin pausa" },
          ].map((x) => (
            <div key={x.k} className="rounded-lg bg-[#1B3A5C]/5 p-3">
              <p className="text-[12px] uppercase tracking-wide text-muted">{x.k}</p>
              <p className="text-lg font-semibold text-[#1B3A5C]">{x.v}</p>
              <p className="text-[12px] text-muted">{x.s}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[14px]">
          Stop obligatorio en cada trade. Tu cuenta no baja de <b>{formatMoney(plan.equityMinimaUSD)}</b> (drawdown máximo {plan.drawdownPct}%): necesitarías{" "}
          <b>{plan.diasMalosHastaTope} días malos seguidos</b> para llegar a ese tope.
        </p>
        <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-[14px] text-muted">
          {plan.razones.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <div className="mt-3 rounded-lg border border-border p-3">
          <p className="text-[13px] font-medium">Tu checklist antes de entrar (lo marcas ✓/✗ en la bitácora):</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[14px]">
            {plan.checklist.map((x) => (
              <li key={x}>✓ {x}</li>
            ))}
          </ul>
        </div>
        <p className="mt-3 text-[12px] text-muted">VICTOR no es asesor financiero. Esto es una estrategia de manejo de riesgo para proteger tu capital y que, si pierdes, pierdas con conciencia: no es una recomendación de inversión ni promesa de resultados. El trading conlleva riesgo de pérdida. Lo puedes cambiar cuando quieras.</p>
        <div className="mt-3 rounded-lg border border-teal/30 bg-teal/5 p-3">
          <p className="text-[15px] font-medium">Pruébalas sin cambiarlas</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DURACIONES_PRUEBA.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDiasPrueba(d)}
                className={`rounded-pill border px-3 py-1.5 text-[14px] ${diasPrueba === d ? "border-teal bg-teal text-white" : "border-border bg-card"}`}
              >
                {d} días
              </button>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-muted">
            Opera {diasPrueba} días con estas reglas. Tu bitácora queda documentada y al final VICTOR revisa tus resultados contigo y ajustan juntos desde el chat. Menos de 14 días no alcanza para saber qué funciona.
          </p>
        </div>
        {error && <p className="mt-2 text-sm text-red">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="vc-btn-primary"
            disabled={guardando}
            onClick={async () => {
              setGuardando(true);
              setError(null);
              const e = await onAplicar(plan, diasPrueba);
              setGuardando(false);
              if (e) setError(e);
              else {
                setPlan(null);
                onAbrir(false);
              }
            }}
          >
            {guardando ? "Guardando…" : `Empezar prueba de ${diasPrueba} días`}
          </button>
          <button className="rounded-lg border border-border px-4 py-2 text-sm" onClick={() => setPlan(null)}>
            Cambiar respuestas
          </button>
        </div>
      </div>
    );
  }

  const pregunta = (n: number, titulo: string, hijo: ReactNode) => (
    <div className="flex flex-col gap-2">
      <p className="text-[15px] font-medium">
        <span className="text-teal">{n}.</span> {titulo}
      </p>
      {hijo}
    </div>
  );

  return (
    <div className="vc-card mb-4 flex flex-col gap-4 border-2 border-teal/40">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm uppercase tracking-wide text-teal">Arma tu plan</p>
          <p className="mt-1 text-lg font-semibold">7 preguntas y VICTOR te propone tus reglas.</p>
        </div>
        <button className="text-sm text-muted" onClick={() => onAbrir(false)} aria-label="Cerrar">
          ✕
        </button>
      </div>
      {pregunta(
        1,
        "¿Con cuánto capital vas a operar? ($)",
        <input
          inputMode="decimal"
          className="vc-input max-w-[200px]"
          value={capital}
          onChange={(e) => setCapital(e.target.value)}
          placeholder="Ej. 500"
        />
      )}
      {pregunta(2, "¿Cuánta experiencia tienes?", <Chips opciones={EXPERIENCIA} valor={exp} onCambio={setExp} />)}
      {pregunta(3, "¿Cómo operas?", <Chips opciones={ESTILO} valor={estilo} onCambio={setEstilo} />)}
      {pregunta(4, "¿Qué te ha hecho perder dinero? (puedes marcar varias)", <Chips opciones={PROBLEMAS} valor={problemas} onCambio={setProblemas} multiple />)}
      {pregunta(5, "¿Qué buscas?", <Chips opciones={OBJETIVO} valor={objetivo} onCambio={setObjetivo} />)}
      {pregunta(6, "¿Qué edad tienes?", <Chips opciones={EDAD} valor={edad} onCambio={setEdad} />)}
      {pregunta(
        7,
        "¿En qué sesión puedes operar? (puedes marcar varias; ninguna = sin límite)",
        <>
          <Chips opciones={SESION_OPC} valor={sesiones} onCambio={setSesiones} multiple />
          <span className="text-[12px] text-muted">Se ajustan solas a tu hora. Después puedes poner horas exactas, días sin operar o pausas en Mis reglas.</span>
        </>
      )}
      <button
        className="vc-btn-primary self-start disabled:opacity-50"
        disabled={!completo}
        onClick={() => setPlan(armarPlan({ capital: cap, experiencia: exp[0], estilo: estilo[0], problemas, objetivo: objetivo[0], edad: edad[0], sesiones }))}
      >
        Ver mi plan
      </button>
    </div>
  );
}
