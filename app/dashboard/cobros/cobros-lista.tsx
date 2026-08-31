"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

type Factura = {
  id: string;
  numero: string;
  total: number;
  estado: string;
  fecha_vencimiento: string | null;
  clients: { name: string } | null;
};

const METODOS_PAGO = ["ATH Móvil", "Transferencia", "Cheque", "Efectivo", "Tarjeta", "Otro"];

function estaVencida(f: Factura): boolean {
  return !!f.fecha_vencimiento && f.fecha_vencimiento < new Date().toISOString().slice(0, 10);
}

export default function CobrosLista({
  facturasIniciales,
  errorCarga,
}: {
  facturasIniciales: Factura[];
  errorCarga: string | null;
}) {
  const supabase = createClient();
  const [facturas, setFacturas] = useState(facturasIniciales);
  const [pagando, setPagando] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState(METODOS_PAGO[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function marcarPagada(id: string) {
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ estado: "pagada", metodo_pago: metodoPago })
      .eq("id", id);
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setFacturas((prev) => prev.filter((f) => f.id !== id));
    setPagando(null);
  }

  const vencidas = facturas.filter(estaVencida);
  const pendientes = facturas.filter((f) => !estaVencida(f));
  const totalPendiente = facturas.reduce((sum, f) => sum + Number(f.total), 0);

  return (
    <div className="vc-shell">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-muted hover:opacity-80">
          ← VICTOR
        </Link>
      </div>

      <div className="vc-card mb-4">
        <p className="text-xs uppercase tracking-wide text-muted">Total por cobrar</p>
        <p className="mt-1 text-2xl font-semibold">{formatMoney(totalPendiente)}</p>
        {vencidas.length > 0 && (
          <p className="mt-1 text-xs text-red">
            {vencidas.length} factura{vencidas.length > 1 ? "s" : ""} vencida{vencidas.length > 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="vc-card">
        <p className="mb-3 text-xs uppercase tracking-wide text-muted">Pendientes de cobro</p>

        {errorCarga && <p className="text-xs text-amb">No se pudo leer las facturas ({errorCarga}).</p>}
        {error && <p className="mb-2 text-xs text-red">{error}</p>}

        {!errorCarga && facturas.length === 0 && (
          <p className="text-xs text-muted">No tienes facturas pendientes de cobro ahora mismo.</p>
        )}

        {[...vencidas, ...pendientes].map((f) => {
          const vencida = estaVencida(f);
          return (
            <div key={f.id} className="border-b border-border py-2.5 text-sm last:border-0">
              <div className="flex items-center justify-between">
                <Link href={`/dashboard/facturacion/${f.id}`} className="flex-1">
                  <p className="font-medium">{f.numero}</p>
                  <p className="text-xs text-muted">
                    {f.clients?.name ?? "Sin cliente"} · {vencida ? (
                      <span className="text-red">venció {f.fecha_vencimiento}</span>
                    ) : (
                      <span>vence {f.fecha_vencimiento}</span>
                    )}
                  </p>
                </Link>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatMoney(Number(f.total))}</span>
                  {pagando !== f.id && (
                    <button
                      className="rounded-lg border border-teal px-2.5 py-1.5 text-xs font-medium text-teal hover:opacity-80"
                      onClick={() => setPagando(f.id)}
                    >
                      Marcar pagada
                    </button>
                  )}
                </div>
              </div>

              {pagando === f.id && (
                <div className="mt-2 flex items-center gap-2">
                  <select className="vc-input flex-1" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                    {METODOS_PAGO.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <button className="vc-btn-primary flex-shrink-0" disabled={loading} onClick={() => marcarPagada(f.id)}>
                    {loading ? "..." : "Confirmar"}
                  </button>
                  <button
                    className="flex-shrink-0 text-xs text-muted hover:opacity-80"
                    onClick={() => setPagando(null)}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
