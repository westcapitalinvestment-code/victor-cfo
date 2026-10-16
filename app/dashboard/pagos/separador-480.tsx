"use client";

import { useEffect, useState } from "react";

type VendorLite = { id: string; name: string; email?: string | null };
type Fila = { key: string; pagina: number; nombre: string; ultimos4: string; vendorId: string | null };
type Guardado = { id: string; anio: number; enviado_en: string | null; enviado_a: string | null; vendors: { name: string } | { name: string }[] | null };

// 16 oct 2026: separa el PDF combinado de 480.6SP del contable en un
// formulario por contratista, con vista previa para confirmar, y lo guarda
// y envía por correo a cada uno.
export default function Separador480({ entidadId, vendors }: { entidadId: string | null; vendors: VendorLite[] }) {
  const [abierto, setAbierto] = useState(false);
  const [anio, setAnio] = useState(new Date().getFullYear() - 1);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [asig, setAsig] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [guardados, setGuardados] = useState<Guardado[]>([]);

  function cargarGuardados() {
    fetch(`/api/pagos/480-6sp/forms${entidadId ? `?entityId=${entidadId}` : ""}`)
      .then((r) => r.json())
      .then((d) => setGuardados(d.forms ?? []))
      .catch(() => {});
  }
  useEffect(cargarGuardados, [entidadId]);

  async function subir(file: File) {
    setCargando(true);
    setMsg(null);
    setFilas(null);
    const fd = new FormData();
    fd.append("file", file);
    if (entidadId) fd.append("entityId", entidadId);
    try {
      const r = await fetch("/api/pagos/480-6sp/separar", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "No se pudo separar.");
      setFilas(d.paginas);
      const a: Record<string, string> = {};
      for (const p of d.paginas as Fila[]) a[p.key] = p.vendorId ?? "";
      setAsig(a);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error.");
    }
    setCargando(false);
  }

  async function confirmar(enviar: boolean) {
    if (!filas) return;
    const items = filas.filter((f) => asig[f.key]).map((f) => ({ key: f.key, vendorId: asig[f.key] }));
    if (items.length === 0) return setMsg("Asigna al menos un contratista.");
    setCargando(true);
    setMsg(null);
    try {
      const r = await fetch("/api/pagos/480-6sp/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anio, entityId: entidadId, enviar, items }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar.");
      const res = d.resultados as { nombre: string; guardado: boolean; enviado: boolean; motivo?: string }[];
      const env = res.filter((x) => x.enviado).length;
      const sin = res.filter((x) => x.guardado && !x.enviado && enviar).map((x) => `${x.nombre} (${x.motivo ?? "no enviado"})`);
      setMsg(`Guardados: ${res.filter((x) => x.guardado).length}. Enviados por correo: ${env}.${sin.length ? ` Sin enviar: ${sin.join(", ")}.` : ""}`);
      setFilas(null);
      cargarGuardados();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error.");
    }
    setCargando(false);
  }

  const sinCorreo = (id: string) => !vendors.find((v) => v.id === id)?.email;

  return (
    <div className="vc-card mt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted">Separar 480.6SP por contratista</p>
        <button type="button" className="vc-btn-back text-xs" onClick={() => setAbierto(!abierto)}>
          {abierto ? "Cerrar" : "Abrir"}
        </button>
      </div>
      {abierto && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[11px] text-muted">
            Sube el PDF combinado que te envía tu contable. Lo separamos en un formulario por página, detectamos el contratista y tú confirmas antes de guardar y enviar.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select className="vc-input w-28" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
              {[0, 1, 2, 3].map((i) => {
                const y = new Date().getFullYear() - i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
            <input type="file" accept="application/pdf" disabled={cargando} onChange={(e) => e.target.files?.[0] && subir(e.target.files[0])} className="text-sm" />
          </div>
          {cargando && <p className="text-sm text-muted">Procesando… puede tardar un minuto.</p>}
          {filas && (
            <>
              <ul className="flex flex-col divide-y divide-border text-sm">
                {filas.map((f) => (
                  <li key={f.key} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="w-16 text-muted">Pág. {f.pagina}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {f.nombre || "No se leyó"}
                      {f.ultimos4 ? ` · …${f.ultimos4}` : ""}
                    </span>
                    <select className="vc-input w-56" value={asig[f.key] ?? ""} onChange={(e) => setAsig({ ...asig, [f.key]: e.target.value })}>
                      <option value="">— No guardar —</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                    {asig[f.key] && sinCorreo(asig[f.key]) && <span className="text-[11px] text-red-600">sin correo</span>}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="vc-btn-primary" disabled={cargando} onClick={() => confirmar(true)}>
                  Guardar y enviar por correo
                </button>
                <button type="button" className="vc-btn-back" disabled={cargando} onClick={() => confirmar(false)}>
                  Solo guardar
                </button>
                <button type="button" className="vc-btn-back" disabled={cargando} onClick={() => setFilas(null)}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}
      {guardados.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-border text-sm">
          {guardados.map((g) => {
            const nombre = Array.isArray(g.vendors) ? g.vendors[0]?.name : g.vendors?.name;
            return (
              <li key={g.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate">{nombre ?? "Contratista"} · {g.anio}</p>
                  <p className="text-[11px] text-muted">{g.enviado_en ? `Enviado a ${g.enviado_a}` : "Guardado, sin enviar"}</p>
                </div>
                <a className="vc-btn-back text-xs" target="_blank" rel="noreferrer" href={`/api/pagos/480-6sp/forms?id=${g.id}`}>Descargar</a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
