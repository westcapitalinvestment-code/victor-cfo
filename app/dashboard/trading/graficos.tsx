"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import type { DiaResumen } from "@/lib/trading";

// Gráficos del módulo Trading. Sin librerías: SVG y CSS.
const VERDE = "#1f9d74";
const ROJO = "#d64545";

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export function nombreMes(ym: string): string {
  const [a, m] = ym.split("-");
  return `${MESES[Number(m) - 1]?.slice(0, 3) ?? m} ${a}`;
}

const corto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(Math.abs(v) < 10 ? 2 : 0));

// ---------- Calendario por días ----------
export function Calendario({
  ym,
  onCambiarMes,
  dias,
  diaSel,
  onDia,
}: {
  ym: string; // "YYYY-MM"
  onCambiarMes: (delta: number) => void;
  dias: Record<string, DiaResumen>;
  diaSel: string | null;
  onDia: (fecha: string | null) => void;
}) {
  const [a, m] = ym.split("-").map(Number);
  const primero = new Date(Date.UTC(a, m - 1, 1));
  const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const offset = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const semanas: (string | null)[][] = [];
  let fila: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= diasMes; d++) {
    fila.push(`${ym}-${String(d).padStart(2, "0")}`);
    if (fila.length === 7) {
      semanas.push(fila);
      fila = [];
    }
  }
  if (fila.length) semanas.push([...fila, ...Array(7 - fila.length).fill(null)]);
  const totalMes = Object.values(dias).filter((d) => d.fecha.startsWith(ym)).reduce((s, d) => s + d.neto, 0);

  return (
    <div className="vc-card !p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-base font-medium">
          {MESES[m - 1]} {a} <span className={`ml-2 text-sm ${totalMes >= 0 ? "text-teal" : "text-red"}`}>{formatMoney(totalMes)}</span>
        </p>
        <div className="flex gap-1">
          <button className="rounded-lg border border-border px-2 py-0.5 text-sm" onClick={() => onCambiarMes(-1)} aria-label="Mes anterior">‹</button>
          <button className="rounded-lg border border-border px-2 py-0.5 text-sm" onClick={() => onCambiarMes(1)} aria-label="Mes siguiente">›</button>
        </div>
      </div>
      <div className="grid grid-cols-8 gap-1 text-center text-[13px] text-muted">
        {["L", "M", "M", "J", "V", "S", "D", "Sem."].map((x, i) => (
          <span key={i}>{x}</span>
        ))}
      </div>
      <div className="mt-1 flex flex-col gap-1">
        {semanas.map((s, i) => {
          const tot = s.reduce((acc, f) => acc + (f && dias[f] ? dias[f].neto : 0), 0);
          const hay = s.some((f) => f && dias[f]);
          return (
            <div key={i} className="grid grid-cols-8 gap-1">
              {s.map((f, j) => {
                if (!f) return <span key={j} />;
                const d = dias[f];
                const sel = diaSel === f;
                const bg = d ? (d.neto >= 0 ? "rgba(31,157,116,0.22)" : "rgba(214,69,69,0.22)") : "transparent";
                return (
                  <button
                    key={j}
                    type="button"
                    disabled={!d}
                    onClick={() => onDia(sel ? null : f)}
                    className={`flex h-16 flex-col items-center justify-center rounded-md border text-[13px] leading-tight ${sel ? "border-[#1B3A5C] ring-1 ring-[#1B3A5C]" : "border-border"}`}
                    style={{ background: bg }}
                  >
                    <span className="text-muted">{Number(f.slice(8))}</span>
                    {d && <span className="font-medium">{corto(d.neto)}</span>}
                    {d && <span className="text-[12px] text-muted">{d.trades}t</span>}
                  </button>
                );
              })}
              <div className={`flex h-16 items-center justify-center rounded-md text-[13px] font-medium ${hay ? (tot >= 0 ? "text-teal" : "text-red") : "text-muted"}`}>
                {hay ? corto(tot) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Curva de capital ----------
export function CurvaCapital({ serie: serieDolares, base }: { serie: { fecha: string; saldo: number }[]; base?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [modo, setModo] = useState<"$" | "%">("$");
  // En modo % cada punto es el resultado acumulado sobre el balance con que empezó el período.
  const puedePct = !!base && base > 0;
  const enPct = modo === "%" && puedePct;
  const serie = enPct ? serieDolares.map((s) => ({ fecha: s.fecha, saldo: (s.saldo / base!) * 100 })) : serieDolares;
  const fmt = (v: number) => (enPct ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : formatMoney(v));
  if (serie.length < 2) return <div className="vc-card text-center text-sm text-muted">Sin datos para la curva.</div>;
  const W = 600, H = 170, PX = 8, PY = 14;
  const min = Math.min(...serie.map((s) => s.saldo));
  const max = Math.max(...serie.map((s) => s.saldo));
  const rango = max - min || 1;
  const x = (i: number) => PX + (i / (serie.length - 1)) * (W - PX * 2);
  const y = (v: number) => H - PY - ((v - min) / rango) * (H - PY * 2);
  const linea = serie.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.saldo).toFixed(1)}`).join(" ");
  const area = `${linea} L${x(serie.length - 1)},${H - PY} L${x(0)},${H - PY} Z`;
  const sube = serie[serie.length - 1].saldo >= serie[0].saldo;
  const color = sube ? VERDE : ROJO;
  const h = hover !== null ? serie[hover] : null;
  return (
    <div className="vc-card !p-3">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <span className="uppercase tracking-wide text-muted">Resultado acumulado</span>
          {puedePct && (
            <span className="inline-flex overflow-hidden rounded-md border border-border text-[12px]">
              {(["$", "%"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setModo(m)} className={`px-2 py-0.5 ${modo === m ? "bg-[#1B3A5C] text-white" : "text-muted"}`}>
                  {m}
                </button>
              ))}
            </span>
          )}
        </span>
        <span className="text-muted">{h ? `${h.fecha} · ${fmt(h.saldo)}` : `${fmt(serie[serie.length - 1].saldo)} en total`}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = (e.clientX - r.left) / r.width;
          setHover(Math.max(0, Math.min(serie.length - 1, Math.round(rel * (serie.length - 1)))));
        }}
        onTouchMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = (e.touches[0].clientX - r.left) / r.width;
          setHover(Math.max(0, Math.min(serie.length - 1, Math.round(rel * (serie.length - 1)))));
        }}
      >
        <defs>
          <linearGradient id="vt-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#vt-grad)" />
        <path d={linea} fill="none" stroke={color} strokeWidth="2" />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PY} y2={H - PY} stroke="currentColor" strokeOpacity="0.25" />
            <circle cx={x(hover)} cy={y(serie[hover].saldo)} r="4" fill={color} />
          </>
        )}
      </svg>
    </div>
  );
}

// ---------- % ganado o perdido por mes ----------
export type MesPct = { ym: string; neto: number; inicio: number; pct: number | null };

export function BarrasMensuales({ meses, total, mesSel, onMes }: { meses: MesPct[]; total: { neto: number; pct: number | null }; mesSel: string; onMes: (ym: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const validos = meses.filter((m) => m.pct !== null);
  if (!validos.length) {
    return <div className="vc-card text-center text-sm text-muted">Escribe tu balance en la pestaña Riesgo para ver el % ganado o perdido.</div>;
  }
  const W = 600, H = 190, PX = 10, TOP = 22, BOT = 26;
  const maxAbs = Math.max(0.5, ...validos.map((m) => Math.abs(m.pct!)));
  const alto = H - TOP - BOT;
  const y0 = TOP + alto / 2;
  const esc = alto / 2 / maxAbs;
  const ancho = (W - PX * 2) / meses.length;
  const barra = Math.min(56, ancho * 0.6);
  const pctTxt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(Math.abs(v) < 10 ? 2 : 1)}%`;
  const h = hover !== null ? meses[hover] : null;
  return (
    <div className="vc-card !p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-sm">
        <span className="uppercase tracking-wide text-muted">% de la cuenta por mes</span>
        <span className="text-muted">
          {h
            ? `${nombreMes(h.ym)} · ${h.pct === null ? "—" : pctTxt(h.pct)} · ${formatMoney(h.neto)} sobre ${formatMoney(h.inicio, 0)}`
            : <>Total: <b className={total.neto >= 0 ? "text-teal" : "text-red"}>{total.pct === null ? "—" : pctTxt(total.pct)}</b> ({formatMoney(total.neto)})</>}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseLeave={() => setHover(null)}>
        <line x1={PX} x2={W - PX} y1={y0} y2={y0} stroke="currentColor" strokeOpacity="0.25" />
        {meses.map((m, i) => {
          const cx = PX + ancho * i + ancho / 2;
          const v = m.pct ?? 0;
          const hgt = Math.max(1.5, Math.abs(v) * esc);
          const yb = v >= 0 ? y0 - hgt : y0;
          const sel = mesSel === m.ym;
          return (
            <g key={m.ym} className="cursor-pointer" onMouseEnter={() => setHover(i)} onClick={() => onMes(sel ? "todo" : m.ym)}>
              <rect x={cx - ancho / 2} y={TOP - 18} width={ancho} height={H - TOP + 18} fill="transparent" />
              <rect x={cx - barra / 2} y={yb} width={barra} height={hgt} rx="3" fill={v >= 0 ? VERDE : ROJO} fillOpacity={mesSel === "todo" || sel ? 0.9 : 0.35} />
              <text x={cx} y={v >= 0 ? yb - 5 : yb + hgt + 13} textAnchor="middle" fontSize="12" fill="currentColor" fontWeight="500">
                {m.pct === null ? "—" : pctTxt(v)}
              </text>
              <text x={cx} y={H - 6} textAnchor="middle" fontSize="12" fill="currentColor" fillOpacity={sel ? 1 : 0.6} fontWeight={sel ? 600 : 400}>
                {nombreMes(m.ym)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-[12px] text-muted">Cada mes se mide contra el balance que tenías al empezar ese mes. Toca un mes para filtrar el panel.</p>
    </div>
  );
}

// ---------- Anillo (win rate) ----------
export function Anillo({ valor, color = VERDE }: { valor: number; color?: string }) {
  const r = 15, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="5" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={`${(Math.max(0, Math.min(100, valor)) / 100) * c} ${c}`} strokeLinecap="round" />
    </svg>
  );
}
