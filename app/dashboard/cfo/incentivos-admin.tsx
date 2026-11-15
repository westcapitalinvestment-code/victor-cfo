"use client";

import { useEffect, useState } from "react";

// Editor del catálogo de incentivos de PR (15 nov 2026). Solo el founder ve
// esta tarjeta (Dashboard de Operaciones). Cada fila se edita como formulario
// simple; las reglas van en JSON (ver lib/incentivos.ts para los tipos).

type Fila = Record<string, unknown> & { id: string; nombre: string; activo: boolean; verificado_en: string | null; reglas: unknown };

const CAMPOS_TEXTO: { k: string; label: string; largo?: boolean }[] = [
  { k: "nombre", label: "Nombre" },
  { k: "referencia_legal", label: "Referencia legal" },
  { k: "resumen", label: "Resumen", largo: true },
  { k: "beneficios", label: "Beneficios", largo: true },
  { k: "requisitos_texto", label: "Requisitos (texto)", largo: true },
  { k: "urgente", label: "Aviso urgente (fecha/condición que vence)" },
  { k: "excluye", label: "Incompatibilidades" },
  { k: "como_solicitar", label: "Cómo se solicita" },
  { k: "enlace", label: "Enlace" },
  { k: "fuente", label: "Fuente" },
];

const REGLAS_AYUDA =
  'Tipos: {"t":"industria","en":["software",...]}, {"t":"elegible_decreto"}, {"t":"no_elegible_decreto"}, {"t":"ventas_max","v":3000000}, ' +
  '{"t":"empleados_max","v":25}, {"t":"empleados_min","v":1}, {"t":"edad_entre","min":16,"max":35}, {"t":"inicio_desde","v":"2019-07-01"}, ' +
  '{"t":"sin_ventas"}, {"t":"residente_pr"}, {"t":"clientes_fuera_pr"}, {"t":"tiene_decreto"}';

export default function IncentivosAdmin() {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [editando, setEditando] = useState<Fila | null>(null);
  const [reglasTxt, setReglasTxt] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function cargar() {
    const r = await fetch("/api/incentivos/catalogo", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (r.ok) setFilas(j.incentivos);
    else setMsg(j?.error ?? "No se pudo cargar (¿corriste la migración 0210?).");
  }
  useEffect(() => {
    cargar();
  }, []);

  function abrir(f: Fila | null) {
    const base: Fila = f ?? { id: "", nombre: "", tipo: "programa", activo: true, verificado_en: new Date().toISOString().slice(0, 10), reglas: [], orden: 200 };
    setEditando({ ...base });
    setReglasTxt(JSON.stringify(base.reglas ?? [], null, 0));
    setMsg(null);
  }

  async function guardar() {
    if (!editando) return;
    let reglas: unknown;
    try {
      reglas = JSON.parse(reglasTxt || "[]");
    } catch {
      return setMsg("Las reglas no son JSON válido.");
    }
    const r = await fetch("/api/incentivos/catalogo", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editando, reglas }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) return setMsg(j?.error ?? "No se pudo guardar.");
    setEditando(null);
    setMsg("Guardado ✓");
    cargar();
  }

  const set = (k: string, v: unknown) => setEditando((e) => (e ? { ...e, [k]: v } : e));

  if (editando) {
    return (
      <div className="flex flex-col gap-2 text-xs">
        <label className="flex flex-col gap-1 text-muted">
          Id (no cambia después)
          <input className="vc-input" value={editando.id} onChange={(e) => set("id", e.target.value)} disabled={!!filas?.some((f) => f.id === editando.id)} />
        </label>
        <label className="flex flex-col gap-1 text-muted">
          Tipo
          <select className="vc-input" value={String(editando.tipo ?? "programa")} onChange={(e) => set("tipo", e.target.value)}>
            <option value="decreto">Decreto</option>
            <option value="programa">Programa</option>
            <option value="credito">Crédito</option>
          </select>
        </label>
        {CAMPOS_TEXTO.map((c) => (
          <label key={c.k} className="flex flex-col gap-1 text-muted">
            {c.label}
            {c.largo ? (
              <textarea className="vc-input" rows={3} value={String(editando[c.k] ?? "")} onChange={(e) => set(c.k, e.target.value)} />
            ) : (
              <input className="vc-input" value={String(editando[c.k] ?? "")} onChange={(e) => set(c.k, e.target.value)} />
            )}
          </label>
        ))}
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-muted">
            % decreto
            <input type="number" className="vc-input" value={String(editando.tasa_decreto ?? "")} onChange={(e) => set("tasa_decreto", e.target.value === "" ? null : Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Monto máx. $
            <input type="number" className="vc-input" value={String(editando.monto_max ?? "")} onChange={(e) => set("monto_max", e.target.value === "" ? null : Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-muted">
            Orden
            <input type="number" className="vc-input" value={String(editando.orden ?? 100)} onChange={(e) => set("orden", Number(e.target.value))} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-muted">
          Reglas (JSON)
          <textarea className="vc-input font-mono" rows={3} value={reglasTxt} onChange={(e) => setReglasTxt(e.target.value)} />
          <span className="text-[10px]">{REGLAS_AYUDA}</span>
        </label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-muted">
            <input type="checkbox" checked={!!editando.activo} onChange={(e) => set("activo", e.target.checked)} /> Activo
          </label>
          <label className="flex items-center gap-1 text-muted">
            Revisado
            <input type="date" className="vc-input" value={String(editando.verificado_en ?? "")} onChange={(e) => set("verificado_en", e.target.value)} />
          </label>
        </div>
        {msg && <p className="text-red">{msg}</p>}
        <div className="flex gap-2">
          <button className="vc-btn-primary !w-auto px-4" onClick={guardar}>
            Guardar
          </button>
          <button className="text-muted" onClick={() => setEditando(null)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {msg && <p className="text-xs text-muted">{msg}</p>}
      {!filas ? (
        <p className="text-xs text-muted">Cargando…</p>
      ) : (
        filas.map((f) => (
          <button key={f.id} onClick={() => abrir(f)} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-left">
            <span className={f.activo ? "" : "text-muted line-through"}>{f.nombre}</span>
            <span className="text-[11px] text-muted">revisado {f.verificado_en ?? "—"}</span>
          </button>
        ))
      )}
      <button onClick={() => abrir(null)} className="mt-1 self-start text-xs font-medium text-teal">
        + Añadir incentivo
      </button>
    </div>
  );
}
