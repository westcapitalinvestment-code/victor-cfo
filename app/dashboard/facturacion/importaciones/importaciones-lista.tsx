"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Historial de importaciones CSV de facturas + deshacer (7 sept 2026).
// Agrupa por import_batch_id (migración 0074) y deja borrar el lote
// completo si Joel reconoce que subió el archivo equivocado.

type Entity = { id: string; name: string };
type Importacion = {
  batchId: string;
  fecha: string;
  cantidad: number;
  total: number;
  clientes: string[];
  clientesTotal: number;
};

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ImportacionesLista({ entities, entidadPreseleccionada }: { entities: Entity[]; entidadPreseleccionada?: string }) {
  const router = useRouter();
  const entidadInicial = entities.find((e) => e.id === entidadPreseleccionada)?.id ?? entities[0]?.id ?? "";
  const [entityId, setEntityId] = useState(entidadInicial);
  const [importaciones, setImportaciones] = useState<Importacion[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/facturas/csv/importaciones?entityId=${entityId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudieron cargar las importaciones.");
      setImportaciones(data.importaciones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las importaciones.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (entityId) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function borrar(imp: Importacion) {
    if (
      !confirm(
        `¿Borrar esta importación completa? Se eliminarán ${imp.cantidad} factura(s) por un total de ${formatMoney(imp.total)}. Esto no se puede deshacer.`
      )
    )
      return;
    setBorrandoId(imp.batchId);
    setError(null);
    try {
      const res = await fetch(`/api/facturas/csv/importaciones/${imp.batchId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo borrar la importación.");
      setImportaciones((prev) => (prev ?? []).filter((i) => i.batchId !== imp.batchId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la importación.");
    } finally {
      setBorrandoId(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Importaciones de facturas</h1>
        <button onClick={() => router.push("/dashboard/facturacion")} className="text-sm text-muted hover:opacity-80">
          Cerrar
        </button>
      </div>

      {entities.length > 1 && (
        <div className="mb-3">
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Entidad</label>
          <select className="vc-input" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-3">
        <Link
          href={`/dashboard/facturacion/importar${entityId ? `?entidadId=${entityId}` : ""}`}
          className="text-xs font-medium text-muted hover:text-teal"
        >
          + Importar otro CSV
        </Link>
      </div>

      {error && <p className="mb-3 text-xs text-red">{error}</p>}

      {cargando && <p className="text-xs text-muted">Cargando…</p>}

      {!cargando && importaciones && importaciones.length === 0 && (
        <div className="vc-card text-center text-xs text-muted">Todavía no has importado ningún CSV de facturas para esta entidad.</div>
      )}

      {!cargando && importaciones && importaciones.length > 0 && (
        <div className="flex flex-col gap-2">
          {importaciones.map((imp) => (
            <div key={imp.batchId} className="vc-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{formatFecha(imp.fecha)}</p>
                  <p className="text-xs text-muted">
                    {imp.cantidad} factura(s) · {formatMoney(imp.total)}
                  </p>
                  {imp.clientes.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted">
                      {imp.clientes.join(", ")}
                      {imp.clientesTotal > imp.clientes.length ? ` y ${imp.clientesTotal - imp.clientes.length} más` : ""}
                    </p>
                  )}
                </div>
                <button
                  className="shrink-0 rounded border border-red px-2 py-1 text-[11px] text-red hover:bg-red/10"
                  disabled={borrandoId === imp.batchId}
                  onClick={() => borrar(imp)}
                >
                  {borrandoId === imp.batchId ? "Borrando…" : "Borrar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
