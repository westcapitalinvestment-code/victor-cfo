// Réplicas de pantallas de VICTOR con datos FICTICIOS para la landing /empieza.
// Mismas clases (vc-bal, vc-met, vc-card…) que el Inicio real, así lo que se ve
// aquí es lo que la persona encuentra al entrar. Sin datos reales de nadie.
import type { ReactNode } from "react";

export function Marco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg shadow-lg">
      <div className="flex items-center gap-2 border-b border-border bg-white px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-[#e5e5e5]" />
        <span className="h-2 w-2 rounded-full bg-[#e5e5e5]" />
        <span className="h-2 w-2 rounded-full bg-[#e5e5e5]" />
        <span className="ml-2 text-[10px] text-muted">{titulo}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export function MockDashboard() {
  const m = (l: string, v: string, c = "") => (
    <div className="vc-met">
      <p className="vc-ml">{l}</p>
      <p className={`vc-mv ${c}`}>{v}</p>
    </div>
  );
  return (
    <Marco titulo="Inicio · tu dinero en un vistazo">
      <div className="vc-bal mb-3">
        <p className="vc-bal-lbl">Balance personal</p>
        <p className="vc-bal-amt">$2,480.00</p>
      </div>
      <div className="vc-mets">
        {m("Ingresos", "$1,500", "!text-grn")}
        {m("Gastos", "$1,121")}
        {m("Ahorrado", "$775")}
        {m("Deuda", "$6,650", "!text-red")}
      </div>
    </Marco>
  );
}

export function MockAlertas() {
  const filas: [string, string][] = [
    ["⚠️", "Vas en déficit este mes: gastaste $1,121 pero solo entraron $750 — $371 de diferencia."],
    ["🆕", "Cargo nuevo de $900 en \"Vivienda\" — primera vez que aparece en tu historial."],
    ["📈", "Gastaste 40% más en Restaurantes que tu promedio de los últimos 3 meses."],
    ["🧾", "Tu estimada de impuestos vence el 15 de enero. Aparta ~14% de cada ingreso."],
  ];
  return (
    <Marco titulo="Alertas inteligentes">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">🔎 Alertas inteligentes</p>
        <span className="relative text-base" aria-hidden>
          🔔
          <span className="absolute -right-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D97706] px-1 text-[10px] font-bold text-white">4</span>
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {filas.map(([i, t]) => (
          <div key={t} className="flex items-start gap-2 rounded-lg bg-white p-2.5">
            <span aria-hidden>{i}</span>
            <p className="min-w-0 flex-1 text-[11px] leading-snug">{t}</p>
            <span className="shrink-0 rounded-full border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">Vista</span>
          </div>
        ))}
      </div>
    </Marco>
  );
}

export function MockResumen() {
  const barra = (n: string, p: number, ok: boolean) => (
    <div key={n}>
      <div className="flex justify-between text-[11px]">
        <span className="font-medium">{n}</span>
        <span className={ok ? "text-grn" : "text-red"}>{p}%</span>
      </div>
      <div className="vc-bar mt-1">
        <div className="vc-bar-fill" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
  return (
    <Marco titulo="Tu resumen del mes">
      <p className="mb-2 text-xs">
        Llevas <strong>$1,121</strong> en gastos de octubre — tu categoría con más gasto es <span className="font-medium text-teal">Vivienda</span> con <strong>$900</strong>.
      </p>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["Entró", "$1,500"],
          ["Salió", "$1,121"],
          ["Neto", "+$379"],
        ].map(([a, b]) => (
          <div key={a} className="rounded-lg bg-white p-2">
            <p className="text-[10px] text-muted">{a}</p>
            <p className="text-sm font-medium">{b}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {barra("Necesidades", 50, true)}
        {barra("Gustos", 28, true)}
        {barra("Ahorro y deudas", 12, false)}
      </div>
    </Marco>
  );
}

export function MockDeudas() {
  const d: [string, string, string][] = [
    ["Tarjeta tienda", "$650", "26% anual"],
    ["Tarjeta Visa", "$1,800", "24% anual"],
    ["Préstamo del carro", "$4,200", "7% anual"],
  ];
  return (
    <Marco titulo="Saldar deudas">
      <div className="mb-2 flex gap-1 rounded-lg border border-border p-0.5 text-[11px]">
        <span className="flex-1 rounded-md bg-teal px-2 py-1 text-center font-medium text-white">Bola de nieve</span>
        <span className="flex-1 px-2 py-1 text-center text-muted">Avalancha</span>
      </div>
      <div className="mb-3 flex flex-col divide-y divide-border rounded-lg bg-white">
        {d.map(([n, s, a], i) => (
          <div key={n} className="flex items-center justify-between px-3 py-2">
            <div>
              <p className="text-xs font-medium">
                {i + 1}. {n}
              </p>
              <p className="text-[10px] text-muted">{a}</p>
            </div>
            <p className="text-xs font-medium text-red">{s}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-[#eefaf4] p-3 text-center">
        <p className="text-[11px] text-muted">Con $300 al mes sales de deudas en</p>
        <p className="text-xl font-semibold text-teal">24 meses</p>
        <p className="text-[10px] text-muted">Empieza por la tarjeta de tienda</p>
      </div>
    </Marco>
  );
}

export function MockDocsCitas() {
  const f: [string, string, string, string][] = [
    ["📅", "Cita con el dentista", "Jueves 29 · 10:00 AM", "En 7 días"],
    ["🚗", "Marbete del carro", "Vence el 15 de noviembre", "En 24 días"],
    ["🛡️", "Póliza del seguro", "Vence el 3 de diciembre", "En 42 días"],
  ];
  return (
    <Marco titulo="Citas y Documentos">
      <div className="flex flex-col gap-2">
        {f.map(([i, t, s, e]) => (
          <div key={t} className="flex items-center gap-3 rounded-lg bg-white p-2.5">
            <span className="text-lg" aria-hidden>
              {i}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium">{t}</p>
              <p className="text-[10px] text-muted">{s}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#fff4e0] px-2 py-0.5 text-[10px] font-medium text-[#B45309]">{e}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-[10px] text-muted">🔔 Te llega una notificación antes de la fecha</p>
    </Marco>
  );
}

export function MockPlan() {
  const p: [boolean, string][] = [
    [true, "Anota tu balance de hoy"],
    [true, "Anota tus deudas"],
    [false, "Junta un colchón de $500"],
    [false, "Ataca tu primera deuda"],
  ];
  return (
    <Marco titulo="Tu plan: salir de deudas">
      <div className="rounded-xl p-3" style={{ background: "rgba(245,158,11,0.10)", border: "1px solid #f59e0b" }}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium">Tu plan: salir de deudas</p>
          <p className="text-[11px] font-medium text-[#B45309]">2/4</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {p.map(([h, t]) => (
            <div key={t} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[11px]">
              <span aria-hidden>{h ? "✅" : "⬜"}</span>
              <span className={h ? "text-muted line-through" : "font-medium"}>{t}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white p-2">
            <p className="text-[9px] uppercase text-muted">Patrimonio neto</p>
            <p className="text-xs font-medium text-red">-$4,170</p>
          </div>
          <div className="rounded-lg bg-white p-2">
            <p className="text-[9px] uppercase text-muted">Págate primero</p>
            <p className="text-xs font-medium">10%</p>
          </div>
        </div>
      </div>
    </Marco>
  );
}
