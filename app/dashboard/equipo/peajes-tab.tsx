"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

// Tab "Peajes" dentro de Equipo (10 sept 2026, migración 0082) — a diferencia
// del tab de Gastos (que depende de que el técnico se acuerde de reportar),
// este usa el estado de cuenta que el propio AutoExpreso genera como fuente
// de verdad: cada cruce ya trae la placa, así que sabemos qué carro pasó sin
// depender de que nadie lo reporte. El banco/Plaid solo ve el cobro
// consolidado mensual, nunca el detalle por placa — por eso esto es un
// módulo separado de "evidencia de gastos por técnico".
//
// 3 secciones: (1) Vehículos — registro simple de placas, (2) Importar
// estado — sube el PDF, Claude lo lee, se confirma un preview y se importa,
// (3) Historial de cruces — con las placas sin vehículo registrado marcadas.

type Vehiculo = { id: string; placa: string; alias: string | null; activo: boolean };
type Cruce = {
  id: string;
  fecha: string;
  hora: string | null;
  plaza: string | null;
  monto: number;
  placa: string;
  vehiculoAlias: string | null;
  sinVehiculo: boolean;
};
type Upload = {
  id: string;
  nombre_archivo: string;
  periodo_desde: string;
  periodo_hasta: string;
  total_cruces: number;
  total_monto: number;
  created_at: string;
};
type CruceExtraido = { fecha: string; hora?: string | null; placa: string; plaza?: string | null; monto: number };

export default function PeajesTab({ entityId }: { entityId: string }) {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [cruces, setCruces] = useState<Cruce[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [cargando, setCargando] = useState(true);

  const [placaNueva, setPlacaNueva] = useState("");
  const [aliasNuevo, setAliasNuevo] = useState("");
  const [creandoVehiculo, setCreandoVehiculo] = useState(false);
  const [errorVehiculo, setErrorVehiculo] = useState<string | null>(null);

  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ cruces: CruceExtraido[]; nombreArchivo: string; r2Key: string | null } | null>(null);
  const [importando, setImportando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function cargarVehiculos() {
    const res = await fetch(`/api/equipo/vehiculos?entityId=${entityId}`);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) setVehiculos(data.vehiculos);
  }

  async function cargarCruces() {
    const res = await fetch(`/api/equipo/peaje?entityId=${entityId}`);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok) {
      setCruces(data.cruces);
      setUploads(data.uploads);
    }
  }

  useEffect(() => {
    (async () => {
      setCargando(true);
      await Promise.all([cargarVehiculos(), cargarCruces()]);
      setCargando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function crearVehiculo() {
    const placa = placaNueva.trim();
    if (!placa) return;
    setCreandoVehiculo(true);
    setErrorVehiculo(null);
    const res = await fetch("/api/equipo/vehiculos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, placa, alias: aliasNuevo || null }),
    });
    const data = await res.json().catch(() => null);
    setCreandoVehiculo(false);
    if (!res.ok || !data?.ok) {
      setErrorVehiculo(data?.error ?? "No se pudo agregar el vehículo.");
      return;
    }
    setPlacaNueva("");
    setAliasNuevo("");
    cargarVehiculos();
  }

  async function actualizarVehiculo(id: string, cambios: Record<string, unknown>) {
    const res = await fetch(`/api/equipo/vehiculos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    if (res.ok) cargarVehiculos();
  }

  async function eliminarVehiculo(v: Vehiculo) {
    if (!window.confirm(`¿Eliminar el vehículo "${v.placa}"?`)) return;
    const res = await fetch(`/api/equipo/vehiculos/${v.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error ?? "No se pudo eliminar. Puedes desactivarlo en su lugar.");
      return;
    }
    cargarVehiculos();
  }

  function alSeleccionarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorSubida(null);
    setSubiendo(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const pdfBase64 = dataUrl.split(",")[1] ?? "";
      try {
        const res = await fetch("/api/equipo/peaje/extraer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64, nombreArchivo: file.name }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
          setErrorSubida(data?.error ?? "No se pudo leer el PDF.");
          return;
        }
        setPreview({ cruces: data.cruces, nombreArchivo: file.name, r2Key: data.r2Key ?? null });
      } catch {
        setErrorSubida("No se pudo leer el PDF. Intenta de nuevo.");
      } finally {
        setSubiendo(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  }

  async function confirmarImportacion() {
    if (!preview || !preview.r2Key) {
      setErrorSubida("Falta el archivo subido — intenta subir el PDF de nuevo.");
      return;
    }
    setImportando(true);
    setErrorSubida(null);
    const res = await fetch("/api/equipo/peaje/importar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, nombreArchivo: preview.nombreArchivo, r2Key: preview.r2Key, cruces: preview.cruces }),
    });
    const data = await res.json().catch(() => null);
    setImportando(false);
    if (!res.ok || !data?.ok) {
      setErrorSubida(data?.error ?? "No se pudo importar.");
      return;
    }
    setPreview(null);
    cargarCruces();
  }

  async function borrarSubida(u: Upload) {
    if (!window.confirm(`¿Borrar la importación "${u.nombre_archivo}"? Se borran también sus ${u.total_cruces} cruces.`)) return;
    const res = await fetch(`/api/equipo/peaje/uploads/${u.id}`, { method: "DELETE" });
    if (res.ok) cargarCruces();
  }

  if (cargando) return <p className="text-xs text-muted">Cargando...</p>;

  return (
    <div className="flex flex-col gap-3">
      {/* Vehículos */}
      <div className="vc-card">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Vehículos</p>
        <p className="mb-3 text-xs text-muted">
          Regístralos por placa para que los cruces importados se vinculen automáticamente al carro correcto.
        </p>

        {vehiculos.length === 0 && <p className="mb-3 text-xs text-muted">Todavía no tienes ningún vehículo registrado.</p>}

        {vehiculos.map((v) => (
          <div key={v.id} className="mb-2 flex items-center gap-2 border-b border-border pb-2 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{v.placa}</p>
              {v.alias && <p className="truncate text-xs text-muted">{v.alias}</p>}
            </div>
            <button
              className={`flex-shrink-0 rounded-pill border px-2.5 py-1 text-xs font-medium ${v.activo ? "border-teal text-teal" : "text-muted"}`}
              style={{ borderColor: v.activo ? undefined : "var(--border)" }}
              onClick={() => actualizarVehiculo(v.id, { activo: !v.activo })}
            >
              {v.activo ? "Activo" : "Inactivo"}
            </button>
            <button className="flex-shrink-0 text-xs text-red hover:opacity-80" onClick={() => eliminarVehiculo(v)}>
              Eliminar
            </button>
          </div>
        ))}

        <div className="mt-2 flex gap-2">
          <input
            className="vc-input flex-1 !text-xs"
            placeholder="Placa (ej. ABC123)"
            value={placaNueva}
            onChange={(e) => setPlacaNueva(e.target.value)}
          />
          <input
            className="vc-input flex-1 !text-xs"
            placeholder="Alias (ej. Camión 1, opcional)"
            value={aliasNuevo}
            onChange={(e) => setAliasNuevo(e.target.value)}
          />
          <button
            className="vc-btn-primary !w-auto flex-shrink-0 !py-1.5 px-4 !text-xs"
            onClick={crearVehiculo}
            disabled={creandoVehiculo || !placaNueva.trim()}
          >
            {creandoVehiculo ? "..." : "+ Añadir"}
          </button>
        </div>
        {errorVehiculo && <p className="mt-2 text-xs text-red">{errorVehiculo}</p>}
      </div>

      {/* Importar estado de AutoExpreso */}
      <div className="vc-card">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Importar estado de peaje</p>
        <p className="mb-3 text-xs text-muted">
          Sube el PDF que descargas de AutoExpreso (o sistema similar) — cada cruce trae la placa, así que sabemos qué carro fue sin
          depender de lo que reporte el banco.
        </p>

        {!preview && (
          <>
            <input ref={fileInputRef} type="file" accept="application/pdf" onChange={alSeleccionarArchivo} disabled={subiendo} className="hidden" id="peaje-pdf-input" />
            <label
              htmlFor="peaje-pdf-input"
              className={`vc-btn-primary inline-block !w-auto cursor-pointer px-4 py-1.5 text-xs ${subiendo ? "pointer-events-none opacity-60" : ""}`}
            >
              {subiendo ? "Leyendo PDF..." : "Subir PDF de AutoExpreso"}
            </label>
            {errorSubida && <p className="mt-2 text-xs text-red">{errorSubida}</p>}
          </>
        )}

        {preview && (
          <div>
            <p className="mb-2 text-sm">
              {preview.cruces.length} cruces encontrados en <span className="font-medium">{preview.nombreArchivo}</span>. Revisa antes de importar:
            </p>
            <div className="max-h-64 overflow-y-auto rounded border border-border">
              {preview.cruces.map((c, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border px-2 py-1.5 text-xs last:border-0">
                  <span>
                    {c.fecha} {c.hora ? `· ${c.hora}` : ""} · <span className="font-medium">{c.placa}</span> {c.plaza ? `· ${c.plaza}` : ""}
                  </span>
                  <span className="flex-shrink-0 font-medium">{formatMoney(c.monto)}</span>
                </div>
              ))}
            </div>
            {errorSubida && <p className="mt-2 text-xs text-red">{errorSubida}</p>}
            <div className="mt-3 flex gap-2">
              <button className="vc-btn-primary !w-auto px-4 py-1.5 text-xs" onClick={confirmarImportacion} disabled={importando}>
                {importando ? "Importando..." : `Confirmar e importar ${preview.cruces.length} cruces`}
              </button>
              <button className="!w-auto px-4 py-1.5 text-xs text-muted hover:opacity-80" onClick={() => setPreview(null)} disabled={importando}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Historial de cruces */}
      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Cruces importados · {cruces.length}</p>
        {cruces.length === 0 && <p className="text-xs text-muted">Ningún cruce importado todavía.</p>}
        {cruces.map((c) => (
          <div key={c.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
            <div className="min-w-0">
              <p className="truncate">
                {c.vehiculoAlias ? `${c.vehiculoAlias} (${c.placa})` : c.placa}
                {c.sinVehiculo && <span className="ml-1 text-amb">· sin vehículo registrado</span>}
              </p>
              <p className="text-xs text-muted">
                {c.fecha} {c.hora ? `· ${c.hora}` : ""} {c.plaza ? `· ${c.plaza}` : ""}
              </p>
            </div>
            <p className="flex-shrink-0 font-medium">{formatMoney(c.monto)}</p>
          </div>
        ))}
      </div>

      {/* Importaciones anteriores */}
      {uploads.length > 0 && (
        <div className="vc-card">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Importaciones anteriores</p>
          {uploads.map((u) => (
            <div key={u.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <div className="min-w-0">
                <p className="truncate">{u.nombre_archivo}</p>
                <p className="text-xs text-muted">
                  {u.periodo_desde} a {u.periodo_hasta} · {u.total_cruces} cruces · {formatMoney(u.total_monto)}
                </p>
              </div>
              <button className="flex-shrink-0 text-xs text-red hover:opacity-80" onClick={() => borrarSubida(u)}>
                Borrar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
