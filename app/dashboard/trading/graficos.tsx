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
  const maxAbs = Math.max(1, ...Object.values(dias).filter((d) => d.fecha.startsWith(ym)).map((d) => Math.abs(d.neto)));
  const totalMes = Object.values(dias).filter((d) => d.fecha.startsWith(ym)).reduce((s, d) => s + d.neto, 0);

  return (
    <div className="vc-card !p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">
          {MESES[m - 1]} {a} <span className={`ml-2 text-xs ${totalMes >= 0 ? "text-teal" : "text-red"}`}>{formatMoney(totalMes)}</span>
        </p>
        <div className="flex gap-1">
          <button className="rounded-lg border border-border px-2 py-0.5 text-xs" onClick={() => onCambiarMes(-1)} aria-label="Mes anterior">‹</button>
          <button className="rounded-lg border border-border px-2 py-0.5 text-xs" onClick={() => onCambiarMes(1)} aria-label="Mes siguiente">›</button>
        </div>
      </div>
      <div className="grid grid-cols-8 gap-1 text-center text-[10px] text-muted">
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
                const alpha = d ? 0.18 + 0.5 * (Math.abs(d.neto) / maxAbs) : 0;
                const bg = d ? (d.neto >= 0 ? `rgba(31,157,116,${alpha})` : `rgba(214,69,69,${alpha})`) : "transparent";
                return (
                  <button
                    key={j}
                    type="button"
                    disabled={!d}
                    onClick={() => onDia(sel ? null : f)}
                    className={`flex h-12 flex-col items-center justify-center rounded-md border text-[10px] leading-tight ${sel ? "border-[#1B3A5C] ring-1 ring-[#1B3A5C]" : "border-border"}`}
                    style={{ background: bg }}
                  >
                    <span className="text-muted">{Number(f.slice(8))}</span>
                    {d && <span className="font-medium">{corto(d.neto)}</span>}
                    {d && <span className="text-[9px] text-muted">{d.trades}t</span>}
                  </button>
                );
              })}
              <div className={`flex h-12 items-center justify-center rounded-md text-[10px] font-medium ${hay ? (tot >= 0 ? "text-teal" : "text-red") : "text-muted"}`}>
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
export function CurvaCapital({ serie }: { serie: { fecha: string; saldo: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (serie.length < 2) return <div className="vc-card text-center text-xs text-muted">Sin datos para la curva.</div>;
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
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="uppercase tracking-wide text-muted">Curva de capital</span>
        <span className="text-muted">{h ? `${h.fecha} · ${formatMoney(h.saldo)}` : `${formatMoney(serie[serie.length - 1].saldo)} ahora`}</span>
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

// ---------- Radar (puntaje de trading) ----------
export function Radar({ ejes, puntaje }: { ejes: { etiqueta: string; valor: number }[]; puntaje: number }) {
  const C = 100, R = 66;
  const punto = (i: number, v: number) => {
    const ang = (-90 + (360 / ejes.length) * i) * (Math.PI / 180);
    return [C + Math.cos(ang) * R * (v / 100), C + Math.sin(ang) * R * (v / 100)] as const;
  };
  const poligono = (v: number) => ejes.map((_, i) => punto(i, v).join(",")).join(" ");
  const datos = ejes.map((e, i) => punto(i, e.valor).join(",")).join(" ");
  const color = puntaje >= 60 ? VERDE : puntaje >= 40 ? "#e0a31a" : ROJO;
  return (
    <div className="vc-card !p-3">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="uppercase tracking-wide text-muted">Perfil de trading</span>
        <span className="font-medium" style={{ color }}>{puntaje.toFixed(0)} / 100</span>
      </div>
      <svg viewBox="0 0 200 200" className="mx-auto w-full max-w-[260px]">
        {[25, 50, 75, 100].map((v) => (
          <polygon key={v} points={poligono(v)} fill="none" stroke="currentColor" strokeOpacity="0.15" />
        ))}
        {ejes.map((_, i) => {
          const [px, py] = punto(i, 100);
          return <line key={i} x1={C} y1={C} x2={px} y2={py} stroke="currentColor" strokeOpacity="0.12" />;
        })}
        <polygon points={datos} fill={color} fillOpacity="0.28" stroke={color} strokeWidth="2" />
        {ejes.map((e, i) => {
          const [px, py] = punto(i, 128);
          return (
            <text key={i} x={px} y={py} fontSize="8" textAnchor="middle" dominantBaseline="middle" fill="currentColor" opacity="0.7">
              {e.etiqueta}
            </text>
          );
        })}
      </svg>
      <p className="mt-1 text-center text-[10px] text-muted">Mide qué tan bien operas, no qué operar. Más lleno = mejor.</p>
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
