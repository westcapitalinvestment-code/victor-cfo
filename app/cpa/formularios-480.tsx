"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Doc = {
  id: string;
  nombre: string;
  tipo: string | null;
  subido_por_contable: boolean;
  subido_por_email: string | null;
  archivos: { id: string; etiqueta: string | null }[];
};

// Subir las 480.6SP al cliente (16 oct 2026, pedido de Joel): el contable
// sube el PDF desde Pagos y le llega al dueño (aparece en su Reportes de
// Pagos y en sus Documentos, con push + correo). Reusa /api/cpa/boveda.
export default function Formularios480({ ownerId, entityId }: { ownerId: string; entityId: string | null }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [miEmail, setMiEmail] = useState("");
  const [anio, setAnio] = useState(String(new Date().getFullYear() - 1));
  const [contratista, setContratista] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const qs = new URLSearchParams({ ownerId });
    if (entityId) qs.set("entityId", entityId);
    const r = await fetch(`/api/cpa/boveda?${qs}`);
    const d = await r.json().catch(() => null);
    if (!r.ok) {
      setDocs([]);
      return;
    }
    setMiEmail((d?.email ?? "").toLowerCase());
    setDocs((d?.documentos ?? []).filter((x: Doc) => x.tipo === "480.6SP"));
  }, [ownerId, entityId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function subir() {
    const archivos = Array.from(inputRef.current?.files ?? []);
    if (archivos.length === 0) {
      setMsg({ tipo: "error", texto: "Escoge el archivo PDF de la 480.6SP." });
      return;
    }
    setSubiendo(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("ownerId", ownerId);
    if (entityId) fd.set("entityId", entityId);
    fd.set("nombre", `480.6SP ${anio}${contratista.trim() ? ` — ${contratista.trim()}` : ""}`);
    fd.set("tipo", "480.6SP");
    fd.set("sinVencimiento", "1");
    if (contratista.trim()) fd.set("etiqueta", contratista.trim());
    for (const f of archivos) fd.append("file", f);
    const r = await fetch("/api/cpa/boveda", { method: "POST", body: fd });
    const d = await r.json().catch(() => null);
    setSubiendo(false);
    if (!r.ok) {
      setMsg({ tipo: "error", texto: d?.error ?? "No se pudo subir." });
      return;
    }
    if (inputRef.current) inputRef.current.value = "";
    setContratista("");
    setMsg({ tipo: "ok", texto: "Subido. Tu cliente ya lo ve y le avisamos." });
    cargar();
  }

  async function borrar(fileId: string) {
    if (!window.confirm("¿Borrar este archivo?")) return;
    const r = await fetch(`/api/cpa/boveda?fileId=${fileId}`, { method: "DELETE" });
    if (r.ok) cargar();
  }

  const anios = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <div className="vc-card">
      <p className="mb-1 text-xs uppercase tracking-wide text-muted">Formularios 480.6SP para el cliente</p>
      <p className="mb-3 text-[11px] text-muted">
        Sube aquí las 480.6SP ya preparadas. Tu cliente las ve en su módulo de Pagos y recibe aviso.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-2 text-xs">
        <label>
          <span className="block text-muted">Año</span>
          <select className="vc-input" value={anio} onChange={(e) => setAnio(e.target.value)}>
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[160px] flex-1">
          <span className="block text-muted">Contratista (opcional)</span>
          <input className="vc-input" value={contratista} onChange={(e) => setContratista(e.target.value)} placeholder="Todos / nombre" />
        </label>
        <input ref={inputRef} type="file" accept="application/pdf,image/*" multiple className="text-xs" />
        <button type="button" className="vc-btn-secondary !w-auto px-4" disabled={subiendo} onClick={subir}>
          {subiendo ? "Subiendo…" : "Subir"}
        </button>
      </div>
      {msg && <p className={`mb-2 text-xs ${msg.tipo === "ok" ? "text-teal" : "text-red"}`}>{msg.texto}</p>}
      {docs === null ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted">Aún no has subido formularios.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate">{d.nombre}</span>
              <div className="flex shrink-0 gap-2">
                {d.archivos.map((a, i) => (
                  <span key={a.id} className="flex gap-1">
                    <a href={`/api/documentos/archivo/${a.id}/ver`} target="_blank" rel="noreferrer" className="vc-btn-back text-xs">
                      Ver{d.archivos.length > 1 ? ` ${i + 1}` : ""}
                    </a>
                    {d.subido_por_contable && (d.subido_por_email ?? "").toLowerCase() === miEmail && (
                      <button type="button" className="vc-btn-back text-xs" onClick={() => borrar(a.id)}>
                        Borrar
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
