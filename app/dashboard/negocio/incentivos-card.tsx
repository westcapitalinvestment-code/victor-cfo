"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { INDUSTRIAS, PREGUNTA_DATO, type Evaluacion } from "@/lib/incentivos";
import type { ResultadoIncentivos } from "@/lib/incentivos-server";

// "Incentivos que podrías aprovechar" (15 nov 2026, pedido de Joel): con los
// números y la situación del negocio, VICTOR señala qué decretos de la Ley 60
// y programas del DDEC PODRÍA aprovechar. El cálculo vive en
// lib/incentivos.ts (puro) y lib/incentivos-server.ts; esta tarjeta solo
// presenta y pide los datos que faltan. Plegada por defecto: una línea.
// Siempre dice "podrías": la decisión es del DDEC y de un profesional.

const ICONO = { cumple: "✅", falta_dato: "🟡", no_aplica: "⚪" } as const;
const ICONO_COND = { si: "✓", no: "✗", falta: "?" } as const;

export default function IncentivosCard({ entityId }: { entityId: string }) {
  const [datos, setDatos] = useState<ResultadoIncentivos | null>(null);
  const [error, setError] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState(false);

  const [industria, setIndustria] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fuera, setFuera] = useState<"" | "si" | "no">("");
  const [edad, setEdad] = useState("");
  const [ventas, setVentas] = useState<"" | "si" | "no">("");

  function aplicar(r: ResultadoIncentivos) {
    setDatos(r);
    setIndustria(r.perfil.industria ?? "");
    setFechaInicio(r.perfil.fechaInicio ?? "");
    setFuera(r.perfil.clientesFueraPR === null ? "" : r.perfil.clientesFueraPR ? "si" : "no");
    setEdad(r.perfil.edadDueno === null ? "" : String(r.perfil.edadDueno));
    setVentas(r.perfil.ventasSegunDueno ? (r.perfil.tieneVentas ? "si" : "no") : "");
  }

  useEffect(() => {
    fetch(`/api/incentivos?entity=${entityId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(aplicar)
      .catch(() => setError(true));
  }, [entityId]);

  if (error || !datos) return null; // nunca tumba el Inicio

  const visibles = datos.evaluaciones.filter((e) => !datos.descartados.includes(e.incentivo.id));
  const cumple = visibles.filter((e) => e.estado === "cumple");
  // Si no se sabe a qué se dedica el negocio, no se listan uno por uno los
  // decretos de cada industria: primero se piden los datos.
  const sinPerfil =
    !datos.perfil.industria || !datos.perfil.fechaInicio || datos.perfil.clientesFueraPR === null || !datos.perfil.ventasSegunDueno;
  const faltaDato = sinPerfil ? [] : visibles.filter((e) => e.estado === "falta_dato");
  const urgentes = cumple.filter((e) => e.incentivo.urgente);
  const mostrarFormulario = sinPerfil || editando;

  async function guardarPerfil() {
    setGuardando(true);
    const res = await fetch("/api/incentivos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: entityId,
        industria: industria || null,
        fecha_inicio: fechaInicio || null,
        clientes_fuera_pr: fuera === "" ? null : fuera === "si",
        ya_tuvo_ventas: ventas === "" ? null : ventas === "si",
        ...(edad ? { edad: Number(edad) } : {}),
      }),
    });
    const j = await res.json().catch(() => null);
    setGuardando(false);
    if (res.ok && j?.evaluaciones) {
      aplicar(j);
      setEditando(false);
    }
  }

  async function descartar(id: string) {
    await fetch("/api/incentivos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: entityId, incentivo: id, descartar: true }),
    });
    setDatos((d) => (d ? { ...d, descartados: [...d.descartados, id] } : d));
  }

  const fila = (e: Evaluacion) => {
    const inc = e.incentivo;
    const abiertoDet = detalle === inc.id;
    return (
      <div key={inc.id} className="rounded-lg border border-border p-2.5">
        <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setDetalle(abiertoDet ? null : inc.id)}>
          <span className="min-w-0">
            <span className="text-sm font-medium text-text">
              {ICONO[e.estado]} {inc.nombre}
            </span>
            {e.estimado && <span className="mt-0.5 block text-[11px] text-muted">{e.estimado}</span>}
            {e.estado === "falta_dato" && (
              <span className="mt-0.5 block text-[11px] text-amb">Falta: {e.faltan.map((f) => PREGUNTA_DATO[f]).join(" · ")}</span>
            )}
          </span>
          <span className="shrink-0 text-xs text-muted">{abiertoDet ? "▲" : "▼"}</span>
        </button>
        {abiertoDet && (
          <div className="mt-2 flex flex-col gap-2 text-xs text-text">
            {inc.urgente && e.estado !== "no_aplica" && <p className="rounded-md border border-border p-2 text-amb">⏰ {inc.urgente}</p>}
            <p className="text-muted">{inc.resumen}</p>
            <div>
              <p className="font-medium">Beneficios</p>
              <p className="text-muted">{inc.beneficios}</p>
            </div>
            <div>
              <p className="font-medium">Requisitos según tus datos</p>
              <ul className="mt-0.5 flex flex-col gap-0.5">
                {e.condiciones.map((c, i) => (
                  <li key={i} className={c.estado === "si" ? "text-grn" : c.estado === "no" ? "text-red" : "text-amb"}>
                    {ICONO_COND[c.estado]} {c.texto}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted">{inc.requisitos_texto}</p>
            </div>
            {inc.excluye && <p className="text-[11px] text-amb">Ojo: {inc.excluye}</p>}
            {inc.como_solicitar && (
              <p className="text-[11px] text-muted">
                <span className="font-medium text-text">Cómo se solicita:</span> {inc.como_solicitar}
                {inc.enlace && (
                  <>
                    {" "}
                    <a href={inc.enlace} target="_blank" rel="noopener noreferrer" className="font-medium text-teal">
                      Ver más →
                    </a>
                  </>
                )}
              </p>
            )}
            <p className="text-[10px] text-muted">
              {inc.referencia_legal}
              {inc.verificado_en && <> · revisado {inc.verificado_en}</>}
            </p>
            <button onClick={() => descartar(inc.id)} className="self-start text-[11px] text-muted underline">
              No me interesa
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="vc-card !p-0 mb-3">
      <button className="flex w-full items-center justify-between p-4 text-left" onClick={() => setAbierto(!abierto)}>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">Incentivos que podrías aprovechar</span>
          <span className="text-sm text-text">
            {sinPerfil
              ? "Contesta 4 preguntas y VICTOR te dice qué decretos y ayudas del DDEC podrías aprovechar"
              : cumple.length > 0
                ? `${cumple.length} incentivo${cumple.length === 1 ? "" : "s"} para ${datos.entidad.nombre}`
                : "Por ahora no vemos incentivos para este negocio"}
          </span>
          {urgentes.length > 0 && <span className="mt-0.5 block text-[11px] text-amb">⏰ {urgentes[0].incentivo.urgente}</span>}
        </span>
        <span className="shrink-0 text-xs text-muted">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          {mostrarFormulario ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                {PREGUNTA_DATO.industria}
                <select className="vc-input" value={industria} onChange={(e) => setIndustria(e.target.value)}>
                  <option value="">Escoge…</option>
                  {INDUSTRIAS.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                {PREGUNTA_DATO.fecha_inicio}
                <input type="date" className="vc-input" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                {PREGUNTA_DATO.clientes_fuera_pr}
                <select className="vc-input" value={fuera} onChange={(e) => setFuera(e.target.value as "" | "si" | "no")}>
                  <option value="">Escoge…</option>
                  <option value="si">Sí</option>
                  <option value="no">No, solo en Puerto Rico</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                {PREGUNTA_DATO.ya_tuvo_ventas}{" "}
                <span className="text-[10px]">(no cuenta el dinero que pusiste tú, préstamos, cashback ni compras de prueba)</span>
                <select className="vc-input" value={ventas} onChange={(e) => setVentas(e.target.value as "" | "si" | "no")}>
                  <option value="">Escoge…</option>
                  <option value="no">Todavía no</option>
                  <option value="si">Sí, ya vendí</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                {PREGUNTA_DATO.edad} <span className="text-[10px]">(opcional; para el decreto de Joven Empresario)</span>
                <input type="number" min={14} max={110} className="vc-input" value={edad} onChange={(e) => setEdad(e.target.value)} />
              </label>
              <button className="vc-btn-primary mt-1" onClick={guardarPerfil} disabled={guardando || !industria}>
                {guardando ? "Evaluando…" : "Ver mis incentivos"}
              </button>
            </div>
          ) : (
            <button className="self-start text-[11px] font-medium text-teal" onClick={() => setEditando(true)}>
              Cambiar los datos del negocio
            </button>
          )}

          {!sinPerfil && cumple.map(fila)}
          {faltaDato.length > 0 && (
            <>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted">Falta un dato</p>
              {faltaDato.map(fila)}
            </>
          )}
          {!sinPerfil && (
            <button className="self-start text-[11px] font-medium text-teal" onClick={() => setVerTodos(!verTodos)}>
              {verTodos ? "Ocultar los que no aplican" : "Ver también los que no aplican"}
            </button>
          )}
          {!sinPerfil && verTodos && visibles.filter((e) => e.estado === "no_aplica").map(fila)}

          <p className="mt-1 text-[11px] text-muted">
            VICTOR te dice lo que <b>podrías</b> aprovechar según tus datos; quien decide es el DDEC. Antes de solicitar, verifícalo con tu CPA o
            abogado.{" "}
            <Link href="/dashboard/invitar-contable" className="font-medium text-teal">
              Invita a tu contable →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
