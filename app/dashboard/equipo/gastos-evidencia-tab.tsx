"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

// Tab "Gastos" dentro de Equipo (10 sept 2026, migración 0081) — evidencia
// de gastos por técnico + reconciliación con transacciones bancarias. Nace
// de un caso real de Joel: en un negocio de transportación, un empleado
// puede echar gasolina de su carro personal y pasarla como gasto de la
// tarjeta corporativa. Este tab tiene 3 partes: (1) configurar los tipos de
// gasto que requieren evidencia (nada hardcodeado — cada negocio define los
// suyos), (2) ver la evidencia que los técnicos han reportado y si ya casó
// con una transacción del banco, y (3) la bandera roja real: transacciones
// en esas categorías que NADIE respaldó con evidencia.
//
// Self-contenido a propósito (trae sus propios datos vía fetch, en vez de
// recibir props del page.tsx del portal) — evita tocar el data-fetching del
// server component grande (page.tsx) y el prop-drilling del client
// component grande (equipo-portal.tsx), que ya manejan bastante.

type Categoria = { id: string; nombre: string };
type TipoGasto = {
  id: string;
  nombre: string;
  hacienda_category_id: string | null;
  tolerancia_monto: number;
  ventana_dias: number;
  activo: boolean;
  hacienda_categories: { nombre: string } | null;
};
type LogEvidencia = {
  id: string;
  monto: number;
  fecha: string;
  r2Key: string;
  nota: string | null;
  estado: string;
  tecnicoNombre: string;
  tipoNombre: string;
};
type SinEvidencia = { id: string; descripcion: string | null; monto: number; fecha: string; tipoNombre: string };

export default function GastosEvidenciaTab({ entityId }: { entityId: string }) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tipos, setTipos] = useState<TipoGasto[]>([]);
  const [logs, setLogs] = useState<LogEvidencia[]>([]);
  const [sinEvidencia, setSinEvidencia] = useState<SinEvidencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nombreNuevo, setNombreNuevo] = useState("");
  const [categoriaNueva, setCategoriaNueva] = useState("");
  const [creando, setCreando] = useState(false);

  async function cargarTipos() {
    const res = await fetch(`/api/equipo/tipos-gasto?entityId=${entityId}`);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) setTipos(data.tipos);
  }

  async function cargarEvidencia() {
    const res = await fetch(`/api/equipo/gastos-evidencia?entityId=${entityId}`);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      setLogs(data.logs);
      setSinEvidencia(data.sinEvidencia);
    }
  }

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      setCargando(true);
      const [{ data: cats }] = await Promise.all([
        supabase.from("hacienda_categories").select("id, nombre").eq("activo", true).order("nombre"),
        cargarTipos(),
        cargarEvidencia(),
      ]);
      setCategorias(cats ?? []);
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function crearTipo() {
    const nombre = nombreNuevo.trim();
    if (!nombre) return;
    setCreando(true);
    setError(null);
    const res = await fetch("/api/equipo/tipos-gasto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, nombre, haciendaCategoryId: categoriaNueva || null }),
    });
    const data = await res.json().catch(() => null);
    setCreando(false);
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "No se pudo crear el tipo de gasto.");
      return;
    }
    setNombreNuevo("");
    setCategoriaNueva("");
    cargarTipos();
  }

  async function actualizarTipo(id: string, cambios: Record<string, unknown>) {
    const res = await fetch(`/api/equipo/tipos-gasto/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    if (res.ok) cargarTipos();
  }

  async function eliminarTipo(t: TipoGasto) {
    if (!window.confirm(`¿Eliminar "${t.nombre}"?`)) return;
    const res = await fetch(`/api/equipo/tipos-gasto/${t.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error ?? "No se pudo eliminar.");
      return;
    }
    cargarTipos();
  }

  if (cargando) return <p className="text-xs text-muted">Cargando...</p>;

  return (
    <div className="flex flex-col gap-3">
      {/* Configurar tipos de gasto */}
      <div className="vc-card">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Tipos de gasto con evidencia requerida</p>
        <p className="mb-3 text-xs text-muted">
          Cada uno que actives le aparece al técnico en su app para reportar con foto. Vincúlalo a una categoría para que se compare
          automáticamente contra las transacciones del banco — sin categoría, solo queda el log.
        </p>

        {tipos.length === 0 && <p className="mb-3 text-xs text-muted">Todavía no tienes ninguno configurado.</p>}

        {tipos.map((t) => (
          <div key={t.id} className="mb-2 flex items-center gap-2 border-b border-border pb-2 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{t.nombre}</p>
              <select
                className="vc-input !w-auto !py-1 !text-xs"
                value={t.hacienda_category_id ?? ""}
                onChange={(e) => actualizarTipo(t.id, { haciendaCategoryId: e.target.value || null })}
              >
                <option value="">Sin categoría vinculada (no reconcilia)</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <button
              className={`flex-shrink-0 rounded-pill border px-2.5 py-1 text-xs font-medium ${t.activo ? "border-teal text-teal" : "text-muted"}`}
              style={{ borderColor: t.activo ? undefined : "var(--border)" }}
              onClick={() => actualizarTipo(t.id, { activo: !t.activo })}
            >
              {t.activo ? "Activo" : "Inactivo"}
            </button>
            <button className="flex-shrink-0 text-xs text-red hover:opacity-80" onClick={() => eliminarTipo(t)}>
              Eliminar
            </button>
          </div>
        ))}

        <div className="mt-2 flex gap-2">
          <input
            className="vc-input flex-1 !text-xs"
            placeholder="Nombre nuevo (ej. Gasolina, Peajes, Materiales)"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
          />
          <select className="vc-input !w-auto !text-xs" value={categoriaNueva} onChange={(e) => setCategoriaNueva(e.target.value)}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <button className="vc-btn-primary !w-auto flex-shrink-0 !py-1.5 px-4 !text-xs" onClick={crearTipo} disabled={creando || !nombreNuevo.trim()}>
            {creando ? "..." : "+ Añadir"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red">{error}</p>}
      </div>

      {/* Bandera roja: transacciones sin evidencia */}
      {sinEvidencia.length > 0 && (
        <div className="vc-card border border-red/30 bg-red/[.04]">
          <p className="mb-1 text-xs uppercase tracking-wide text-red">⚠ Sin evidencia · {sinEvidencia.length}</p>
          <p className="mb-3 text-xs text-muted">
            Transacciones del banco en una categoría configurada, pero ningún técnico reportó evidencia — revísalas.
          </p>
          {sinEvidencia.map((t) => (
            <div key={t.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <div className="min-w-0">
                <p className="truncate">{t.descripcion || "Sin descripción"}</p>
                <p className="text-xs text-muted">
                  {t.tipoNombre} · {t.fecha}
                </p>
              </div>
              <p className="flex-shrink-0 font-medium text-red">{formatMoney(t.monto)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Evidencia reportada */}
      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Evidencia reportada · {logs.length}</p>
        {logs.length === 0 && <p className="text-xs text-muted">Ningún técnico ha reportado gastos todavía.</p>}
        {logs.map((l) => (
          <div key={l.id} className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
            <div className="min-w-0">
              <p className="truncate">
                {l.tecnicoNombre} · {l.tipoNombre}
              </p>
              <p className="text-xs text-muted">
                {l.fecha} · {l.estado === "reconciliado" ? <span className="text-teal">✓ Casó con el banco</span> : <span className="text-amb">Pendiente de casar</span>}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <p className="font-medium">{formatMoney(l.monto)}</p>
              <a href={`/api/equipo/gastos-evidencia/${l.id}/ver`} target="_blank" rel="noopener noreferrer" className="text-xs text-teal hover:opacity-80">
                Ver foto
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
