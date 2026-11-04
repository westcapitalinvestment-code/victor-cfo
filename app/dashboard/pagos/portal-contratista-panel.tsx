"use client";

import { useEffect, useState } from "react";

type Subida = { id: string; tipo: string; relevo_pct: number | null; relevo_fecha_expiracion: string | null; created_at: string };

// Panel del dueño dentro del formulario del contratista: enlace de su portal
// en línea (para compartirlo) y los documentos que el contratista envió, que
// quedan en revisión hasta que el dueño los acepta.
export default function PortalContratistaPanel({ vendorId, onAplicado }: { vendorId: string; onAplicado?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function cargar(regenerar = false) {
    const res = await fetch(`/api/pagos/vendors/${vendorId}/portal${regenerar ? "?regenerar=1" : ""}`);
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setUrl(j.url);
      setSubidas(j.subidas ?? []);
    }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [vendorId]);

  async function copiar() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setMsg("Enlace copiado. Compártelo con el contratista."); } catch { setMsg(url); }
  }
  async function regenerar() {
    if (!confirm("El enlace anterior dejará de funcionar. ¿Generar uno nuevo?")) return;
    await cargar(true);
    setMsg("Enlace nuevo generado.");
  }
  async function resolver(id: string, accion: "aplicar" | "rechazar") {
    const res = await fetch(`/api/pagos/vendors/${vendorId}/portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, accion }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(j.error ?? "No se pudo completar.");
    setMsg(accion === "aplicar" ? "Documento aceptado y archivado." : "Documento rechazado.");
    await cargar();
    if (accion === "aplicar") onAplicado?.();
  }

  return (
    <div className="rounded-lg border border-border bg-bg p-2.5">
      <p className="mb-1.5 text-xs font-medium">Portal del contratista</p>
      <p className="mb-1.5 text-[11px] text-muted">
        Enlace privado donde ve lo que se le pagó, lo retenido y su copia del 480.6SP, y puede enviarte su Relevo y Registro de Comerciante.
      </p>
      <div className="flex gap-3">
        <button className="text-[11px] font-medium text-teal hover:opacity-80" onClick={copiar}>Copiar enlace</button>
        <button className="text-[11px] font-medium text-red hover:opacity-80" onClick={regenerar}>Regenerar</button>
      </div>
      {subidas.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <p className="mb-1 text-[11px] font-medium">Enviados por el contratista (por revisar)</p>
          {subidas.map((s) => (
            <div key={s.id} className="mb-1.5 text-[11px]">
              <div>
                {s.tipo === "relevo" ? `Certificado de Relevo (${s.relevo_pct}%, vence ${s.relevo_fecha_expiracion})` : "Registro de Comerciante"}
              </div>
              <div className="flex gap-3">
                <a className="font-medium text-teal hover:opacity-80" target="_blank" href={`/api/pagos/vendors/${vendorId}/portal?ver=${s.id}`}>Ver PDF</a>
                <button className="font-medium text-teal hover:opacity-80" onClick={() => resolver(s.id, "aplicar")}>Aceptar</button>
                <button className="font-medium text-red hover:opacity-80" onClick={() => resolver(s.id, "rechazar")}>Rechazar</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {msg && <p className="mt-1.5 text-[11px] text-muted">{msg}</p>}
    </div>
  );
}
