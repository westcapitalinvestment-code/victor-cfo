"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";

// Historial de estados de cuenta (CSV/PDF) subidos a una cuenta específica
// (Plaid o manual), con botón de borrar cada subida — migración 0072, 6
// sept 2026: Joel subió un estado a la cuenta equivocada y no había forma
// de deshacerlo después del hecho (la pantalla de "Importación completa"
// solo aparece una vez, en el momento; si cierras el chat/refrescas la
// página, se pierde). Esta lista vive independiente de esa pantalla, así
// que se puede volver más tarde a borrar cualquier subida vieja.
type EstadoSubido = {
  id: string;
  origen: "csv" | "pdf";
  nombre_archivo: string | null;
  total_importadas: number;
  total_duplicadas: number;
  metadata_extraida: { apr?: string; balance_nuevo?: number; pago_minimo?: number; limite_credito?: number; periodo?: string } | null;
  created_at: string;
};

export default function EstadosSubidosLista({ origen, cuentaId }: { origen: "plaid" | "manual"; cuentaId: string }) {
  const [estados, setEstados] = useState<EstadoSubido[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/cuentas/estado/lista?origenCuenta=${origen}&cuentaId=${encodeURIComponent(cuentaId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "No se pudo cargar el historial.");
        if (!cancelado) setEstados(data.estados ?? []);
      } catch (err) {
        if (!cancelado) setError(err instanceof Error ? err.message : "No se pudo cargar el historial.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [origen, cuentaId]);

  async function borrar(id: string) {
    setBorrandoId(id);
    try {
      const res = await fetch(`/api/cuentas/estado/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo borrar.");
      setEstados((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      setBorrandoId(null);
      setConfirmandoId(null);
    }
  }

  if (cargando) return <p className="mt-2 text-xs text-muted">Cargando historial…</p>;
  if (error) return <p className="mt-2 text-xs text-red">{error}</p>;
  if (!estados || estados.length === 0) {
    return <p className="mt-2 text-xs text-muted">No hay ningún CSV o PDF subido a esta cuenta todavía.</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      {estados.map((e) => (
        <div key={e.id} className="rounded-lg border border-border p-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">
                {e.origen === "pdf" ? "📄 PDF" : "📊 CSV"} · {e.nombre_archivo || "(sin nombre)"}
              </p>
              <p className="text-muted">
                {new Date(e.created_at).toLocaleDateString("es-PR", { year: "numeric", month: "short", day: "numeric" })} ·{" "}
                {e.total_importadas} transacción{e.total_importadas === 1 ? "" : "es"} importada{e.total_importadas === 1 ? "" : "s"}
                {e.total_duplicadas > 0 ? ` · ${e.total_duplicadas} duplicada(s)` : ""}
              </p>
              {e.metadata_extraida && (
                <p className="mt-1 text-muted">
                  {e.metadata_extraida.apr && `APR ${e.metadata_extraida.apr}`}
                  {e.metadata_extraida.balance_nuevo != null && ` · Balance ${formatMoney(e.metadata_extraida.balance_nuevo)}`}
                  {e.metadata_extraida.pago_minimo != null && ` · Mínimo ${formatMoney(e.metadata_extraida.pago_minimo)}`}
                </p>
              )}
            </div>
            {confirmandoId === e.id ? (
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <button
                  className="rounded-lg bg-red px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                  disabled={borrandoId === e.id}
                  onClick={() => borrar(e.id)}
                >
                  {borrandoId === e.id ? "Borrando…" : "Confirmar"}
                </button>
                <button className="text-[11px] text-muted underline" onClick={() => setConfirmandoId(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button className="flex-shrink-0 text-[11px] text-red underline" onClick={() => setConfirmandoId(e.id)}>
                Borrar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
