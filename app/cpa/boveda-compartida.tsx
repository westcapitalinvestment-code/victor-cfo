"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Bóveda compartida del contable (15 oct 2026). Lista los documentos del
// cliente (personales compartidos o de la entidad), muestra qué está vencido
// o por vencer, y deja subir documentos nuevos o renovar uno existente
// (nueva fecha + archivo). Cada subida/renovación avisa al dueño por push y
// correo desde /api/cpa/boveda.
type Doc = {
  id: string;
  nombre: string;
  tipo: string | null;
  fecha_vencimiento: string | null;
  estado: string | null;
  subido_por_contable: boolean;
  subido_por_email: string | null;
  archivos: { id: string; etiqueta: string | null }[];
};

const TIPOS = ["Seguro", "Permiso", "Contrato", "Licencia", "Otro"];

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const [y, m, d] = fecha.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - hoyUTC) / 86400000);
}

function fmtFecha(f: string): string {
  const [y, m, d] = f.split("-");
  return `${m}/${d}/${y}`;
}

function EstadoVence({ fecha }: { fecha: string | null }) {
  const dias = diasHasta(fecha);
  if (dias === null || !fecha) return <span className="text-[11px] text-muted">Sin vencimiento</span>;
  if (dias < 0)
    return <span className="rounded-full bg-red/10 px-2 py-0.5 text-[10px] font-medium text-red">Vencido {fmtFecha(fecha)}</span>;
  if (dias <= 30)
    return (
      <span className="rounded-full bg-amb/10 px-2 py-0.5 text-[10px] font-medium text-amb">
        Vence en {dias} d · {fmtFecha(fecha)}
      </span>
    );
  return <span className="text-[11px] text-muted">Vence {fmtFecha(fecha)}</span>;
}

export default function BovedaCompartida({ ownerId, entityId }: { ownerId: string; entityId: string | null }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [miEmail, setMiEmail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [subiendo, setSubiendo] = useState(false);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("Otro");
  const [fecha, setFecha] = useState("");
  const [sinVencNuevo, setSinVencNuevo] = useState(false);
  const archivoNuevoRef = useRef<HTMLInputElement>(null);

  const [renovando, setRenovando] = useState<string | null>(null);
  const [nombreEd, setNombreEd] = useState("");
  const [tipoEd, setTipoEd] = useState("Otro");
  const [fechaRenov, setFechaRenov] = useState("");
  const [sinVencEd, setSinVencEd] = useState(false);
  const [reemplazarEd, setReemplazarEd] = useState(false);
  const archivoRenovRef = useRef<HTMLInputElement>(null);

  function abrirEdicion(d: Doc) {
    setRenovando(d.id);
    setNombreEd(d.nombre);
    setTipoEd(d.tipo ?? "Otro");
    setFechaRenov(d.fecha_vencimiento ?? "");
    setSinVencEd(!d.fecha_vencimiento);
    setReemplazarEd(false);
    setError(null);
    setOk(null);
  }

  const cargar = useCallback(async () => {
    const qs = new URLSearchParams({ ownerId });
    if (entityId) qs.set("entityId", entityId);
    const res = await fetch(`/api/cpa/boveda?${qs.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "No se pudo cargar la Bóveda.");
      setDocs([]);
      return;
    }
    setDocs(json.documentos ?? []);
    setMiEmail((json.email ?? "").toLowerCase());
  }, [ownerId, entityId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function enviar(fd: FormData, mensajeOk: string): Promise<boolean> {
    setError(null);
    setOk(null);
    fd.set("ownerId", ownerId);
    if (entityId) fd.set("entityId", entityId);
    const res = await fetch("/api/cpa/boveda", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "No se pudo guardar.");
      return false;
    }
    setOk(mensajeOk);
    await cargar();
    return true;
  }

  async function subirNuevo(e: React.FormEvent) {
    e.preventDefault();
    const files = Array.from(archivoNuevoRef.current?.files ?? []);
    const fd = new FormData();
    fd.set("nombre", nombre);
    fd.set("tipo", tipo);
    if (sinVencNuevo) fd.set("sinVencimiento", "1");
    else if (fecha) fd.set("fechaVencimiento", fecha);
    files.forEach((f) => fd.append("file", f));
    setSubiendo(true);
    const exito = await enviar(fd, "Documento subido. Se le avisó a tu cliente.");
    setSubiendo(false);
    if (exito) {
      setNombre("");
      setTipo("Otro");
      setFecha("");
      setSinVencNuevo(false);
      setMostrarNuevo(false);
      if (archivoNuevoRef.current) archivoNuevoRef.current.value = "";
    }
  }

  async function renovar(e: React.FormEvent, docId: string) {
    e.preventDefault();
    const files = Array.from(archivoRenovRef.current?.files ?? []);
    if (!nombreEd.trim()) {
      setError("El nombre no puede quedar vacío.");
      return;
    }
    const fd = new FormData();
    fd.set("documentId", docId);
    fd.set("nombre", nombreEd.trim());
    fd.set("tipo", tipoEd);
    if (sinVencEd) fd.set("sinVencimiento", "1");
    else if (fechaRenov) fd.set("fechaVencimiento", fechaRenov);
    if (reemplazarEd && files.length > 0) fd.set("reemplazar", "1");
    files.forEach((f) => fd.append("file", f));
    setSubiendo(true);
    const exito = await enviar(fd, "Documento actualizado. Se le avisó a tu cliente.");
    setSubiendo(false);
    if (exito) {
      setRenovando(null);
      setFechaRenov("");
    }
  }

  async function borrarArchivo(fileId: string) {
    if (!confirm("¿Borrar este archivo?")) return;
    setError(null);
    const res = await fetch(`/api/cpa/boveda?fileId=${fileId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error ?? "No se pudo borrar.");
    await cargar();
  }

  const lista = docs ?? [];
  const vencidos = lista.filter((d) => (diasHasta(d.fecha_vencimiento) ?? 999) < 0);
  const porVencer = lista.filter((d) => {
    const n = diasHasta(d.fecha_vencimiento);
    return n !== null && n >= 0 && n <= 30;
  });

  return (
    <div className="flex flex-col gap-3">
      {(vencidos.length > 0 || porVencer.length > 0) && (
        <div className="vc-card border-amb/40">
          <p className="mb-1 text-sm font-medium">
            <i className="ti ti-bell mr-1 text-amb" />
            Renovaciones pendientes
          </p>
          <ul className="text-xs text-muted">
            {vencidos.map((d) => (
              <li key={d.id}>
                <span className="font-medium text-red">Vencido</span> · {d.nombre}
                {d.fecha_vencimiento ? ` (${fmtFecha(d.fecha_vencimiento)})` : ""}
              </li>
            ))}
            {porVencer.map((d) => (
              <li key={d.id}>
                <span className="font-medium text-amb">Por vencer</span> · {d.nombre}
                {d.fecha_vencimiento ? ` (${fmtFecha(d.fecha_vencimiento)})` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted">
            VICTOR también le avisa a tu cliente; si tú lo renuevas aquí, las alertas se reinician solas.
          </p>
        </div>
      )}

      <div className="vc-card">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Documentos compartidos</p>
          <button type="button" className="vc-btn-primary !w-auto px-3 py-1.5 text-xs" onClick={() => setMostrarNuevo((v) => !v)}>
            {mostrarNuevo ? "Cancelar" : "Subir documento"}
          </button>
        </div>

        {error && <p className="mb-2 text-xs text-red">{error}</p>}
        {ok && <p className="mb-2 text-xs text-grn">{ok}</p>}

        {mostrarNuevo && (
          <form onSubmit={subirNuevo} className="mb-3 flex flex-col gap-2 rounded-lg border border-border p-3">
            <input className="vc-input" placeholder="Nombre del documento" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            <select className="vc-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Fecha de vencimiento</label>
              <input className="vc-input" type="date" value={fecha} disabled={sinVencNuevo} onChange={(e) => setFecha(e.target.value)} />
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={sinVencNuevo}
                  onChange={(e) => {
                    setSinVencNuevo(e.target.checked);
                    if (e.target.checked) setFecha("");
                  }}
                />
                <span>Sin fecha de vencimiento</span>
              </label>
            </div>
            <input ref={archivoNuevoRef} className="text-xs" type="file" multiple accept="image/*,application/pdf" required />
            <button type="submit" className="vc-btn-primary" disabled={subiendo}>
              {subiendo ? "Subiendo..." : "Subir y avisar al cliente"}
            </button>
          </form>
        )}

        {docs === null ? (
          <p className="text-xs text-muted">Cargando...</p>
        ) : lista.length === 0 ? (
          <p className="text-xs text-muted">
            {entityId
              ? "Esta entidad aún no tiene documentos. Sube el primero."
              : "El cliente no ha compartido documentos personales todavía. Puedes subir el primero."}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {lista.map((d) => (
              <div key={d.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {d.nombre}
                      {d.subido_por_contable && (
                        <span className="ml-2 rounded-full border border-teal px-1.5 py-0.5 text-[10px] font-medium text-teal">
                          Subido por contable
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">{d.tipo ?? "Documento"}</p>
                  </div>
                  <EstadoVence fecha={d.fecha_vencimiento} />
                </div>

                {d.archivos.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {d.archivos.map((a, i) => (
                      <span key={a.id} className="inline-flex items-center gap-1">
                        <a
                          href={`/api/documentos/archivo/${a.id}/ver`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-teal px-2.5 py-1 text-[11px] font-medium text-teal"
                        >
                          <i className="ti ti-file mr-1" />
                          {a.etiqueta || `Archivo ${i + 1}`}
                        </a>
                        {d.subido_por_contable && (d.subido_por_email ?? "").toLowerCase() === miEmail && (
                          <button type="button" className="text-[11px] text-muted hover:text-red" onClick={() => borrarArchivo(a.id)} title="Borrar">
                            <i className="ti ti-trash" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-2">
                  {renovando === d.id ? (
                    <form onSubmit={(e) => renovar(e, d.id)} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                      <input className="vc-input" placeholder="Nombre" value={nombreEd} onChange={(e) => setNombreEd(e.target.value)} required />
                      <select className="vc-input" value={tipoEd} onChange={(e) => setTipoEd(e.target.value)}>
                        {TIPOS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <div>
                        <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Fecha de vencimiento</label>
                        <input
                          className="vc-input"
                          type="date"
                          value={fechaRenov}
                          disabled={sinVencEd}
                          onChange={(e) => setFechaRenov(e.target.value)}
                        />
                        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={sinVencEd}
                            onChange={(e) => {
                              setSinVencEd(e.target.checked);
                              if (e.target.checked) setFechaRenov("");
                            }}
                          />
                          <span>Sin fecha de vencimiento</span>
                        </label>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Subir archivo nuevo (opcional)</label>
                        <input ref={archivoRenovRef} className="text-xs" type="file" multiple accept="image/*,application/pdf" />
                        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs">
                          <input type="checkbox" checked={reemplazarEd} onChange={(e) => setReemplazarEd(e.target.checked)} />
                          <span>Reemplazar los archivos anteriores (si no, el viejo se queda guardado)</span>
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="vc-btn-primary" disabled={subiendo}>
                          {subiendo ? "Guardando..." : "Guardar cambios"}
                        </button>
                        <button type="button" className="vc-btn-back" onClick={() => setRenovando(null)}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="rounded-pill border border-border px-2.5 py-1 text-xs"
                      onClick={() => abrirEdicion(d)}
                    >
                      <i className="ti ti-pencil mr-1" />
                      Editar / renovar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
