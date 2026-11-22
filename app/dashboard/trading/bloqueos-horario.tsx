"use client";

import { useEffect, useState } from "react";
import {
  cuandoLocal,
  DIAS_SEMANA,
  estadoHorario,
  fechaLocal,
  SESIONES,
  TODAS_SESIONES,
  ZONAS_COMUNES,
  zonaValida,
  type Bloqueos,
  type Sesion,
} from "@/lib/trading-bloqueos";

// Horario y bloqueos del guardián (22 nov 2026, pedido de Joel): sesiones del
// mercado, horas propias, días, pausas por fecha y noticias. Todo se guarda con
// el botón "Guardar reglas" de la tarjeta Mis reglas.

const chip = (on: boolean) =>
  `rounded-pill border px-3 py-1.5 text-[14px] transition ${on ? "border-teal bg-teal text-white" : "border-border bg-card hover:border-teal/50"}`;

export default function BloqueosHorario({ valor, onCambio }: { valor: Bloqueos; onCambio: (b: Bloqueos) => void }) {
  const b = valor;
  const set = (p: Partial<Bloqueos>) => onCambio({ ...b, ...p });
  const [ahora, setAhora] = useState(() => Date.now());
  const [pDesde, setPDesde] = useState("");
  const [pHasta, setPHasta] = useState("");
  const [pMotivo, setPMotivo] = useState("");

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Primera vez: zona del navegador si es válida
  useEffect(() => {
    if (b.zona !== "America/Puerto_Rico" || b.ventanas.length || b.sesiones.length) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && zonaValida(tz) === tz && tz !== b.zona) set({ zona: tz });
    } catch {
      /* sin zona del navegador */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const est = estadoHorario(b, ahora);
  const hoy = fechaLocal(b.zona, ahora);
  const zonas = ZONAS_COMUNES.some((z) => z.tz === b.zona) ? ZONAS_COMUNES : [{ tz: b.zona, nombre: b.zona.replace(/_/g, " ") }, ...ZONAS_COMUNES];

  const toggleSesion = (s: Sesion) => set({ sesiones: b.sesiones.includes(s) ? b.sesiones.filter((x) => x !== s) : [...b.sesiones, s] });
  const toggleDia = (d: number) => set({ dias: b.dias.includes(d) ? b.dias.filter((x) => x !== d) : [...b.dias, d].sort() });

  return (
    <div className="rounded-lg border border-[#1B3A5C]/30 bg-[#1B3A5C]/5 p-3 text-sm">
      <p className="font-medium">Horario y bloqueos</p>
      <p className="mb-3 text-[13px] text-muted">
        Fuera de esto el guardián no te deja abrir trades (los que ya tengas abiertos siguen con su stop). Si abres uno desde MT5 fuera de horario, lo cierra.
      </p>

      <div className={`mb-3 rounded-lg px-3 py-2 text-[14px] ${est.permitido ? "bg-teal/10 text-teal" : "text-red"}`} style={est.permitido ? undefined : { background: "rgba(214,69,69,0.12)" }}>
        {est.permitido ? "Ahora puedes operar" : `Ahora no se puede operar: ${est.motivo}`}
        {est.cambiaA ? <span className="text-muted"> · {est.permitido ? "se bloquea" : "abre"} {cuandoLocal(b, est.cambiaA, ahora)}</span> : null}
      </div>

      <label className="mb-3 flex flex-col gap-1">
        <span className="text-muted">Tu zona horaria (las horas de abajo son en tu hora)</span>
        <select className="vc-input" value={b.zona} onChange={(e) => set({ zona: e.target.value })}>
          {zonas.map((z) => (
            <option key={z.tz} value={z.tz}>{z.nombre}</option>
          ))}
        </select>
      </label>

      <p className="mb-1 text-muted">Solo operar en estas sesiones del mercado</p>
      <div className="mb-1 flex flex-wrap gap-2">
        {TODAS_SESIONES.map((s) => (
          <button key={s} type="button" className={chip(b.sesiones.includes(s))} onClick={() => toggleSesion(s)} title={SESIONES[s].detalle}>
            {SESIONES[s].nombre}
          </button>
        ))}
      </div>
      <p className="mb-3 text-[12px] text-muted">Se ajustan solas a tu hora y al horario de verano de Londres y Nueva York. Ninguna marcada = sin límite por sesión.</p>

      <p className="mb-1 text-muted">O en estas horas</p>
      <div className="mb-1 flex flex-col gap-2">
        {b.ventanas.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="time"
              className="vc-input w-[130px]"
              value={v.ini}
              onChange={(e) => set({ ventanas: b.ventanas.map((x, j) => (j === i ? { ...x, ini: e.target.value } : x)) })}
            />
            <span>a</span>
            <input
              type="time"
              className="vc-input w-[130px]"
              value={v.fin}
              onChange={(e) => set({ ventanas: b.ventanas.map((x, j) => (j === i ? { ...x, fin: e.target.value } : x)) })}
            />
            <button type="button" className="text-muted" aria-label="Quitar horario" onClick={() => set({ ventanas: b.ventanas.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        {b.ventanas.length < 3 && (
          <button type="button" className="self-start text-[14px] font-medium text-teal" onClick={() => set({ ventanas: [...b.ventanas, { ini: "08:00", fin: "14:00" }] })}>
            + Agregar horario
          </button>
        )}
      </div>
      <p className="mb-3 text-[12px] text-muted">Si marcas sesiones y horas, puedes operar en cualquiera de las dos.</p>

      <p className="mb-1 text-muted">Días sin operar</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button key={d} type="button" className={chip(b.dias.includes(d))} onClick={() => toggleDia(d)}>
            {DIAS_SEMANA[d].slice(0, 3)}
          </button>
        ))}
      </div>

      <p className="mb-1 text-muted">Pausas por fecha (vacaciones, semana de noticias fuertes, un descanso)</p>
      {b.pausas.filter((p) => p.hasta >= hoy).map((p) => (
        <div key={p.desde + p.hasta} className="mb-1 flex items-center justify-between rounded-lg border border-border bg-card px-3 py-1.5 text-[14px]">
          <span>
            {p.desde} → {p.hasta}
            {p.motivo ? <span className="text-muted"> · {p.motivo}</span> : null}
          </span>
          <button type="button" className="text-muted" aria-label="Quitar pausa" onClick={() => set({ pausas: b.pausas.filter((x) => x !== p) })}>
            ✕
          </button>
        </div>
      ))}
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">Desde</span>
          <input type="date" className="vc-input" value={pDesde} min={hoy} onChange={(e) => setPDesde(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">Hasta</span>
          <input type="date" className="vc-input" value={pHasta} min={pDesde || hoy} onChange={(e) => setPHasta(e.target.value)} />
        </label>
        <input className="vc-input w-[150px]" placeholder="Motivo (opcional)" value={pMotivo} maxLength={60} onChange={(e) => setPMotivo(e.target.value)} />
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-[14px] disabled:opacity-50"
          disabled={!pDesde}
          onClick={() => {
            const hasta = pHasta && pHasta >= pDesde ? pHasta : pDesde;
            set({ pausas: [...b.pausas, { desde: pDesde, hasta, ...(pMotivo.trim() ? { motivo: pMotivo.trim() } : {}) }] });
            setPDesde("");
            setPHasta("");
            setPMotivo("");
          }}
        >
          Agregar pausa
        </button>
      </div>

      <p className="mb-1 text-muted">Noticias de alto impacto</p>
      <div className="flex flex-wrap gap-2">
        {[0, 15, 30, 60].map((m) => (
          <button key={m} type="button" className={chip(b.noticiasMin === m)} onClick={() => set({ noticiasMin: m })}>
            {m === 0 ? "No bloquear" : `${m} min antes y después`}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[12px] text-muted">Usa el calendario económico de MT5: solo las noticias de la moneda del activo que vas a abrir (ej. USD para el oro).</p>
    </div>
  );
}
