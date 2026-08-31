"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

type Item = {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal_linea: number | null;
};

type Factura = {
  id: string;
  numero: string;
  subtotal: number;
  ivu_pct: number;
  ivu_monto: number;
  retencion_pct: number;
  retencion_monto: number;
  total: number;
  estado: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  metodo_pago: string | null;
  notas: string | null;
  clients: { name: string; email: string | null } | null;
  business_entities: { name: string } | null;
};

const METODOS_PAGO = ["ATH Móvil", "Transferencia", "Cheque", "Efectivo", "Tarjeta", "Otro"];

function hoyVencida(f: Factura): boolean {
  return f.estado !== "pagada" && f.estado !== "borrador" && !!f.fecha_vencimiento && f.fecha_vencimiento < new Date().toISOString().slice(0, 10);
}

export default function FacturaDetalle({ factura, items }: { factura: Factura; items: Item[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState(METODOS_PAGO[0]);
  const [confirmandoPago, setConfirmandoPago] = useState(false);

  const clienteNombre = factura.clients?.name ?? "Sin cliente";
  const entidadNombre = factura.business_entities?.name ?? "";
  const vencida = hoyVencida(factura);
  const estadoTexto = vencida ? "vencida" : factura.estado;

  async function actualizarEstado(nuevoEstado: string, extra?: { metodo_pago?: string }) {
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ estado: nuevoEstado, ...(extra ?? {}) })
      .eq("id", factura.id);
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => router.push("/dashboard/facturacion")} className="text-sm text-muted hover:opacity-80">
          ← Facturas
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-medium">{factura.numero}</p>
            <p className="text-xs text-muted">
              {clienteNombre} {entidadNombre && `· ${entidadNombre}`}
            </p>
            {factura.clients?.email && <p className="text-xs text-muted">{factura.clients.email}</p>}
          </div>
          <span
            className={`rounded px-2 py-1 text-xs font-medium ${
              estadoTexto === "pagada"
                ? "bg-teal text-white"
                : estadoTexto === "vencida"
                ? "bg-red/10 text-red"
                : estadoTexto === "borrador"
                ? "bg-border text-muted"
                : "bg-teal/10 text-teal"
            }`}
          >
            {estadoTexto === "pagada"
              ? "Pagada"
              : estadoTexto === "vencida"
              ? "Vencida"
              : estadoTexto === "borrador"
              ? "Borrador"
              : estadoTexto === "vista"
              ? "Vista"
              : "Enviada"}
          </span>
        </div>

        <div className="flex justify-between text-xs text-muted">
          <span>Emitida: {factura.fecha_emision}</span>
          {factura.fecha_vencimiento && <span>Vence: {factura.fecha_vencimiento}</span>}
        </div>

        <div className="rounded-lg border border-border">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between border-b border-border p-2.5 text-sm last:border-0">
              <div>
                <p>{it.descripcion}</p>
                <p className="text-xs text-muted">
                  {it.cantidad} × {formatMoney(it.precio_unitario)}
                </p>
              </div>
              <span>{formatMoney(it.subtotal_linea ?? it.cantidad * it.precio_unitario)}</span>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-bg p-3 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-muted">Subtotal</span>
            <span>{formatMoney(factura.subtotal)}</span>
          </div>
          {factura.ivu_pct > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted">IVU ({factura.ivu_pct}%)</span>
              <span>+{formatMoney(factura.ivu_monto)}</span>
            </div>
          )}
          {factura.retencion_pct > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted">Retención ({factura.retencion_pct}%)</span>
              <span>-{formatMoney(factura.retencion_monto)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
            <span>Total</span>
            <span>{formatMoney(factura.total)}</span>
          </div>
        </div>

        {factura.notas && (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Notas</p>
            <p className="text-sm text-text">{factura.notas}</p>
          </div>
        )}

        {factura.metodo_pago && (
          <p className="text-xs text-muted">Pagada vía {factura.metodo_pago}</p>
        )}

        {factura.estado !== "pagada" && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {factura.estado === "borrador" && (
              <button className="vc-btn-secondary" disabled={loading} onClick={() => actualizarEstado("enviada")}>
                Marcar como enviada
              </button>
            )}

            {!confirmandoPago ? (
              <button className="vc-btn-primary" disabled={loading} onClick={() => setConfirmandoPago(true)}>
                Marcar como pagada
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <select className="vc-input flex-1" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                  {METODOS_PAGO.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  className="vc-btn-primary flex-shrink-0"
                  disabled={loading}
                  onClick={() => actualizarEstado("pagada", { metodo_pago: metodoPago })}
                >
                  {loading ? "..." : "Confirmar"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
