"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";
import {
  armarPlan,
  elegirCamino,
  mesesDeFondo,
  patrimonioNeto,
  planCompleto,
  siguientePrioridad,
  MESES_FONDO_META,
  type Accion,
  type Camino,
  type DatosPlan,
  type Respuestas,
} from "@/lib/plan-gratis";

// "Tu plan" (22 oct 2026) — tarjeta del plan gratis, justo debajo del balance.
// Sin cuestionario: pregunta 4 cosas y arma un camino. Con camino: pasos con
// botón que abre el panel correspondiente, patrimonio neto, fondo de emergencia,
// prioridad y los aportes del mes (con Deshacer). Cuando todos los pasos están
// hechos se reduce a una línea; si algo cambia (ej. anotas una deuda nueva) los
// pasos se recalculan solos y la tarjeta vuelve a abrirse.
export type AporteFila = { id: string; tipo: "ahorro" | "inversion" | "deuda"; monto: number; fecha: string; deuda_nombre: string | null };

const COLOR: Record<Camino, { fondo: string; borde: string; chip: string }> = {
  deudas: { fondo: "rgba(245,158,11,0.10)", borde: "#f59e0b", chip: "Salir de deudas" },
  ordenar: { fondo: "rgba(20,184,166,0.10)", borde: "#14b8a6", chip: "Ordenar y crecer" },
  probar: { fondo: "rgba(59,130,246,0.10)", borde: "#3b82f6", chip: "Probar la app" },
};

type Opcion<T> = { v: T; t: string };
const PREGUNTAS: { clave: keyof Respuestas; titulo: string; opciones: Opcion<string>[] }[] = [
  {
    clave: "motivo",
    titulo: "¿Qué quieres lograr primero?",
    opciones: [
      { v: "deudas", t: "Salir de mis deudas" },
      { v: "ordenar", t: "Ordenar mi dinero" },
      { v: "ahorrar", t: "Ahorrar e invertir" },
      { v: "probar", t: "Probar la app con mis números" },
    ],
  },
  {
    clave: "deudas",
    titulo: "¿Tienes deudas (tarjetas, préstamos)?",
    opciones: [
      { v: "si", t: "Sí" },
      { v: "no", t: "No" },
    ],
  },
  {
    clave: "sobra",
    titulo: "Al final del mes, ¿te sobra algo?",
    opciones: [
      { v: "nada", t: "Nada, llego justo o en negativo" },
      { v: "poco", t: "Poco (menos del 10%)" },
      { v: "si", t: "Sí, 10% o más" },
    ],
  },
  {
    clave: "fondo",
    titulo: "¿Tienes un fondo de emergencia?",
    opciones: [
      { v: "no", t: "No todavía" },
      { v: "algo", t: "Algo (menos de 3 meses)" },
      { v: "tres", t: "Sí, 3 meses o más" },
    ],
  },
];

function abrirPanel(a: Accion | undefined) {
  if (!a || a.tipo !== "panel") return;
  window.dispatchEvent(new CustomEvent("vc-abrir-panel", { detail: { panel: a.panel } }));
}

function BotonAccion({ accion, texto, primario }: { accion?: Accion; texto?: string; primario?: boolean }) {
  if (!accion || !texto) return null;
  const cls = primario
    ? "vc-btn-primary !w-auto px-3 !py-1.5 !text-xs"
    : "shrink-0 rounded-pill border border-teal px-3 py-1 text-[11px] font-medium text-teal hover:opacity-80";
  if (accion.tipo === "link")
    return (
      <Link href={accion.href} className={cls}>
        {texto}
      </Link>
    );
  return (
    <button type="button" className={cls} onClick={() => abrirPanel(accion)}>
      {texto}
    </button>
  );
}

export default function PlanGratisCard({
  respuestas,
  datos,
  aportes,
}: {
  respuestas: Respuestas | null;
  datos: DatosPlan;
  aportes: AporteFila[];
}) {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [resp, setResp] = useState<Partial<Respuestas>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verPlan, setVerPlan] = useState(false);
  const [rehaciendo, setRehaciendo] = useState(false);

  async function guardar(r: Respuestas) {
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/onboarding-gratis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ respuestas: r }),
    });
    setGuardando(false);
    if (!res.ok) return setError("No se pudo guardar. Intenta otra vez.");
    setPaso(0);
    setResp({});
    setRehaciendo(false);
    router.refresh();
  }

  function elegir(clave: keyof Respuestas, valor: string) {
    const nueva = { ...resp, [clave]: valor } as Partial<Respuestas>;
    setResp(nueva);
    if (paso < PREGUNTAS.length - 1) return setPaso(paso + 1);
    guardar(nueva as Respuestas);
  }

  async function deshacer(id: string) {
    setError(null);
    const res = await fetch(`/api/aportes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) return setError("No se pudo deshacer.");
    router.refresh();
  }

  // ---------- Cuestionario ----------
  if (!respuestas || rehaciendo) {
    const q = PREGUNTAS[paso];
    return (
      <div className="mb-3 rounded-xl p-4" style={{ background: "rgba(20,184,166,0.10)", border: "1px solid #14b8a6" }}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">🧭 Arma tu plan en 4 preguntas</p>
          <p className="text-[11px] text-muted">
            {paso + 1} de {PREGUNTAS.length}
          </p>
        </div>
        <p className="mb-3 text-[11px] text-muted">Sin tecnicismos. Con tus respuestas te armo los pasos que más te convienen.</p>
        <p className="mb-2 text-sm">{q.titulo}</p>
        <div className="flex flex-col gap-2">
          {q.opciones.map((o) => (
            <button
              key={o.v}
              type="button"
              disabled={guardando}
              onClick={() => elegir(q.clave, o.v)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:border-teal"
            >
              {o.t}
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-red">{error}</p>}
        <div className="mt-2 flex gap-3">
          {paso > 0 && (
            <button type="button" className="text-[11px] text-muted underline" onClick={() => setPaso(paso - 1)}>
              Atrás
            </button>
          )}
          {rehaciendo && (
            <button type="button" className="text-[11px] text-muted underline" onClick={() => { setRehaciendo(false); setPaso(0); }}>
              Cancelar
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------- Plan armado ----------
  const camino = elegirCamino(respuestas);
  const plan = armarPlan(camino, respuestas, datos);
  const col = COLOR[camino];
  const completo = planCompleto(plan);
  const hechos = plan.pasos.filter((p) => p.hecho).length;
  const meses = mesesDeFondo(datos);
  const prioridad = siguientePrioridad(datos);
  const patrimonio = patrimonioNeto(datos);
  const pagateTotal = datos.aportesMes + datos.pagosDeudaMes;
  const pagatePct = datos.ingresosMes > 0 ? Math.round((pagateTotal / datos.ingresosMes) * 100) : null;
  const flujo = datos.ingresosMes - datos.gastosMes;

  // Todo hecho: una línea discreta. Si algo cambia, planCompleto() vuelve a false
  // y la tarjeta completa reaparece sola.
  if (completo && !verPlan) {
    return (
      <div className="mb-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(34,197,94,0.10)", border: "1px solid #22c55e" }}>
        <span>✅ Tu plan está al día · {col.chip}</span>
        <button type="button" className="font-medium text-teal underline" onClick={() => setVerPlan(true)}>
          Ver mi plan
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl p-4" style={{ background: col.fondo, border: `1px solid ${col.borde}` }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{plan.titulo}</p>
          <p className="mt-0.5 text-[11px] text-muted">{plan.subtitulo}</p>
        </div>
        <p className="shrink-0 text-[11px] font-medium" style={{ color: col.borde }}>
          {hechos}/{plan.pasos.length}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {plan.pasos.map((p) => (
          <div key={p.id} className="flex items-start gap-2 rounded-lg bg-card px-3 py-2">
            <span aria-hidden className="mt-0.5 text-sm">
              {p.hecho ? "✅" : "⬜"}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${p.hecho ? "text-muted line-through" : ""}`}>{p.titulo}</p>
              {!p.hecho && <p className="text-[11px] text-muted">{p.detalle}</p>}
            </div>
            {!p.hecho && <BotonAccion accion={p.accion} texto={p.boton} />}
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-card px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted">Patrimonio neto</p>
          <p className={`text-sm font-medium ${patrimonio < 0 ? "text-red" : ""}`}>
            <Sensitive>{formatMoney(patrimonio)}</Sensitive>
          </p>
          <p className="text-[10px] text-muted">lo que tienes − lo que debes</p>
        </div>
        <div className="rounded-lg bg-card px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted">Fondo de emergencia</p>
          <p className="text-sm font-medium">{meses === null ? "—" : `${meses.toFixed(1)} meses`}</p>
          <p className="text-[10px] text-muted">meta {MESES_FONDO_META} meses de lo básico</p>
        </div>
        <div className="rounded-lg bg-card px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted">Págate primero</p>
          <p className="text-sm font-medium">{pagatePct === null ? "—" : `${pagatePct}%`}</p>
          <p className="text-[10px] text-muted">de tus ingresos · meta 10% → 20%</p>
        </div>
        <div className="rounded-lg bg-card px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted">Flujo neto del mes</p>
          <p className={`text-sm font-medium ${flujo < 0 ? "text-red" : "text-grn"}`}>
            <Sensitive>{formatMoney(flujo)}</Sensitive>
          </p>
          <p className="text-[10px] text-muted">ingresos − gastos</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-3 py-2">
        <p className="min-w-0 flex-1 text-xs">
          <span className="font-medium">Lo que sigue: </span>
          {prioridad.texto}
        </p>
        <BotonAccion accion={prioridad.accion} texto={prioridad.boton} primario />
      </div>

      {aportes.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Tus aportes de este mes</p>
          <div className="flex flex-col divide-y divide-border rounded-lg bg-card">
            {aportes.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                <span className="min-w-0 truncate">
                  {a.tipo === "ahorro" ? "Ahorro" : a.tipo === "inversion" ? "Inversión" : `Pago a ${a.deuda_nombre ?? "deuda"}`} ·{" "}
                  <Sensitive>{formatMoney(a.monto)}</Sensitive> · {a.fecha}
                </span>
                <button type="button" className="shrink-0 font-medium text-red" onClick={() => deshacer(a.id)}>
                  Deshacer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red">{error}</p>}

      <div className="mt-3 flex gap-4 text-[11px]">
        <button type="button" className="text-muted underline" onClick={() => { setRehaciendo(true); setPaso(0); setResp({}); }}>
          Rehacer el cuestionario
        </button>
        {completo && (
          <button type="button" className="text-muted underline" onClick={() => setVerPlan(false)}>
            Ocultar
          </button>
        )}
      </div>
    </div>
  );
}
