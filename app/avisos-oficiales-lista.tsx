"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Lista del banner "Avisos oficiales" con "Visto" por aviso (1 nov 2026, pedido
// de Joel). Marcar visto guarda en avisos_vistos (por usuario) y lo saca del
// banner; "Ver archivados" los muestra de nuevo y permite restaurarlos.
// Si la tabla aún no existe (migración 0198 sin correr) el aviso se oculta
// igual en esta sesión y no se rompe nada.
export type AvisoItem = {
  id: string;
  url: string;
  fuente_nombre: string;
  titulo: string;
  resumen: string;
  fecha_publicacion: string | null;
  fecha_limite: string | null;
  urgencia: "baja" | "media" | "alta";
};

function fmtFecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function diasHasta(iso: string): number {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Puerto_Rico" });
  return Math.round((new Date(`${iso}T12:00:00Z`).getTime() - new Date(`${hoy}T12:00:00Z`).getTime()) / 86400000);
}

export default function AvisosOficialesLista({
  avisos,
  vistosIniciales,
  disclaimer,
}: {
  avisos: AvisoItem[];
  vistosIniciales: string[];
  disclaimer: string;
}) {
  const [vistos, setVistos] = useState<Set<string>>(new Set(vistosIniciales));
  const [verArchivados, setVerArchivados] = useState(false);

  async function marcar(id: string, visto: boolean) {
    setVistos((prev) => {
      const n = new Set(prev);
      if (visto) n.add(id);
      else n.delete(id);
      return n;
    });
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      if (visto) await supabase.from("avisos_vistos").upsert({ user_id: user.id, aviso_id: id });
      else await supabase.from("avisos_vistos").delete().eq("user_id", user.id).eq("aviso_id", id);
    } catch {
      /* sin tabla o sin red: el cambio queda solo en esta sesión */
    }
  }

  const pendientes = avisos.filter((a) => !vistos.has(a.id));
  const archivados = avisos.filter((a) => vistos.has(a.id));
  const mostrar = verArchivados ? avisos : pendientes;

  if (pendientes.length === 0 && archivados.length === 0) return null;

  // Todo visto: queda solo una línea discreta para reabrir.
  if (pendientes.length === 0 && !verArchivados) {
    return (
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={() => setVerArchivados(true)} className="text-xs text-muted underline">
          Avisos oficiales archivados ({archivados.length})
        </button>
      </div>
    );
  }

  return (
    <div className="vc-card mb-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm uppercase tracking-wide text-muted">Avisos oficiales</p>
        {archivados.length > 0 && (
          <button type="button" onClick={() => setVerArchivados((v) => !v)} className="text-xs text-muted underline">
            {verArchivados ? "Ocultar archivados" : `Ver archivados (${archivados.length})`}
          </button>
        )}
      </div>
      <div className="space-y-3">
        {mostrar.map((a) => {
          const dias = a.fecha_limite ? diasHasta(a.fecha_limite) : null;
          const esVisto = vistos.has(a.id);
          return (
            <div key={a.id} className={`border-l-2 pl-3 ${esVisto ? "border-gray-300 opacity-60" : "border-teal"}`}>
              <p className="text-xs text-muted">
                {a.fuente_nombre}
                {a.fecha_publicacion ? ` · ${fmtFecha(a.fecha_publicacion)}` : ""}
              </p>
              <p className="mt-0.5 text-sm font-medium">{a.titulo}</p>
              <p className="mt-1 text-sm">{a.resumen}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {a.fecha_limite && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      dias !== null && dias <= 7 ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    Fecha límite según la fuente: {fmtFecha(a.fecha_limite)}
                    {dias !== null && dias >= 0 ? ` (${dias === 0 ? "hoy" : `en ${dias} día${dias === 1 ? "" : "s"}`})` : ""}
                  </span>
                )}
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-teal underline">
                  Ver fuente oficial →
                </a>
                <button
                  type="button"
                  onClick={() => marcar(a.id, !esVisto)}
                  className="ml-auto rounded-full border border-gray-300 px-2.5 py-0.5 text-xs font-medium text-muted hover:bg-gray-50"
                >
                  {esVisto ? "Restaurar" : "✓ Visto"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-muted">{disclaimer}</p>
    </div>
  );
}
