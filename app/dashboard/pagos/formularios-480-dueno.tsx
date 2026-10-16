"use client";

import { useEffect, useState } from "react";

type Doc = {
  id: string;
  nombre: string;
  created_at: string;
  subido_por_contable: boolean;
  archivos: { id: string; etiqueta: string | null }[];
};

// Formularios 480.6SP que sube el contable (16 oct 2026): el dueño los
// descarga aquí sin pedirlos por correo.
export default function Formularios480Dueno({ entidadId }: { entidadId: string | null }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  useEffect(() => {
    fetch(`/api/pagos/formularios-480${entidadId ? `?entityId=${entidadId}` : ""}`)
      .then((r) => r.json())
      .then((d) => setDocs(d.documentos ?? []))
      .catch(() => setDocs([]));
  }, [entidadId]);

  return (
    <div className="vc-card mt-3">
      <p className="mb-1 text-xs uppercase tracking-wide text-muted">Formularios 480.6SP de tu contable</p>
      <p className="mb-2 text-[11px] text-muted">
        Cuando tu contable sube las 480.6SP, aparecen aquí y te avisamos por notificación y correo.
      </p>
      {docs === null ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay formularios subidos.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate">{d.nombre}</p>
                <p className="text-[11px] text-muted">{new Date(d.created_at).toLocaleDateString("es-PR")}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {d.archivos.map((a, i) => (
                  <a key={a.id} href={`/api/documentos/archivo/${a.id}/ver`} target="_blank" rel="noreferrer" className="vc-btn-back text-xs">
                    Descargar{d.archivos.length > 1 ? ` ${i + 1}` : ""}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
