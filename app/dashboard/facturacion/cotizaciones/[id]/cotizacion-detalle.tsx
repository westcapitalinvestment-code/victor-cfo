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

type Cotizacion = {
  id: string;
  numero: string;
  subtotal: number;
  ivu_pct: number;
  ivu_monto: number;
  total: number;
  estado: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  notas: string | null;
  invoice_id: string | null;
  entity_id: string | null;
  client_id: string | null;
  clients: { name: string; email: string | null; es_negocio: boolean; retention_pct: number } | null;
  business_entities: { name: string; invoice_prefix: string; invoice_start_number: number; default_payment_terms: string } | null;
};

const ESTILOS_BADGE: Record<string, string> = {
  enviada: "bg-teal/10 text-teal",
  aprobada: "bg-teal text-white",
  rechazada: "bg-red/10 text-red",
  convertida: "bg-border text-muted",
};

const ETIQUETAS_BADGE: Record<string, string> = {
  enviada: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  convertida: "Convertida en factura",
};

export default function CotizacionDetalle({
  cotizacion,
  items,
  conteoFacturas,
}: {
  cotizacion: Cotizacion;
  items: Item[];
  conteoFacturas: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clienteNombre = cotizacion.clients?.name ?? "Sin cliente";
  const entidadNombre = cotizacion.business_entities?.name ?? "";

  async function actualizarEstado(nuevoEstado: string) {
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase.from("cotizaciones").update({ estado: nuevoEstado }).eq("id", cotizacion.id);
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function convertirAFactura() {
    if (!cotizacion.business_entities || !cotizacion.clients) return;
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada — vuelve a entrar.");
      setLoading(false);
      return;
    }

    const retencionPct = cotizacion.clients.es_negocio ? Number(cotizacion.clients.retention_pct || 0) : 0;
    const retencionMonto = Number(cotizacion.subtotal) * (retencionPct / 100);
    const total = Number(cotizacion.subtotal) + Number(cotizacion.ivu_monto) - retencionMonto;
    const numero = `${cotizacion.business_entities.invoice_prefix}-${cotizacion.business_entities.invoice_start_number + conteoFacturas}`;
    const hoy = new Date().toISOString().slice(0, 10);
    const vencimiento = new Date();
    vencimiento.setDate(vencimiento.getDate() + 30);

    const { data: factura, error: insertError } = await supabase
      .from("invoices")
      .insert({
        owner_id: user.id,
        entity_id: cotizacion.entity_id,
        client_id: cotizacion.client_id,
        numero,
        subtotal: cotizacion.subtotal,
        ivu_pct: cotizacion.ivu_pct,
        ivu_monto: cotizacion.ivu_monto,
        retencion_pct: retencionPct,
        retencion_monto: retencionMonto,
        total,
        estado: "enviada",
        fecha_emision: hoy,
        fecha_vencimiento: vencimiento.toISOString().slice(0, 10),
        notas: `Convertida de cotización ${cotizacion.numero}.${cotizacion.notas ? " " + cotizacion.notas : ""}`,
      })
      .select("id")
      .maybeSingle();

    if (insertError || !factura) {
      setError(insertError?.message || "No se pudo crear la factura.");
      setLoading(false);
      return;
    }

    const { error: itemsError } = await supabase.from("invoice_items").insert(
      items.map((it) => ({
        invoice_id: factura.id,
        descripcion: it.descripcion,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        subtotal_linea: it.subtotal_linea ?? it.cantidad * it.precio_unitario,
      }))
    );

    if (itemsError) {
      setLoading(false);
      setError(itemsError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("cotizaciones")
      .update({ estado: "convertida", invoice_id: factura.id })
      .eq("id", cotizacion.id);

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push(`/dashboard/facturacion/${factura.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => router.push("/dashboard/facturacion?tab=cotizaciones")} className="text-sm text-muted hover:opacity-80">
          ← Cotizaciones
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-medium">{cotizacion.numero}</p>
            <p className="text-xs text-muted">
              {clienteNombre} {entidadNombre && `· ${entidadNombre}`}
            </p>
            {cotizacion.clients?.email && <p className="text-xs text-muted">{cotizacion.clients.email}</p>}
          </div>
          <span className={`rounded px-2 py-1 text-xs font-medium ${ESTILOS_BADGE[cotizacion.estado] ?? "bg-border text-muted"}`}>
            {ETIQUETAS_BADGE[cotizacion.estado] ?? cotizacion.estado}
          </span>
        </div>

        <div className="flex justify-between text-xs text-muted">
          <span>Emitida: {cotizacion.fecha_emision}</span>
          {cotizacion.fecha_vencimiento && <span>Válida hasta: {cotizacion.fecha_vencimiento}</span>}
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
            <span>{formatMoney(cotizacion.subtotal)}</span>
          </div>
          {cotizacion.ivu_pct > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted">IVU ({cotizacion.ivu_pct}%)</span>
              <span>+{formatMoney(cotizacion.ivu_monto)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
            <span>Total</span>
            <span>{formatMoney(cotizacion.total)}</span>
          </div>
        </div>

        {cotizacion.notas && (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Notas</p>
            <p className="text-sm text-text">{cotizacion.notas}</p>
          </div>
        )}

        {cotizacion.estado === "enviada" && (
          <div className="flex gap-2 border-t border-border pt-3">
            <button className="vc-btn-primary flex-1" disabled={loading} onClick={() => actualizarEstado("aprobada")}>
              Marcar aprobada
            </button>
            <button
              className="flex-1 rounded-lg border border-border py-2.5 text-sm text-muted hover:opacity-80"
              disabled={loading}
              onClick={() => actualizarEstado("rechazada")}
            >
              Rechazada
            </button>
          </div>
        )}

        {cotizacion.estado === "aprobada" && (
          <div className="border-t border-border pt-3">
            <button className="vc-btn-primary w-full" disabled={loading} onClick={convertirAFactura}>
              {loading ? "Creando factura..." : "Convertir a factura"}
            </button>
          </div>
        )}

        {cotizacion.estado === "convertida" && cotizacion.invoice_id && (
          <div className="border-t border-border pt-3">
            <button
              onClick={() => router.push(`/dashboard/facturacion/${cotizacion.invoice_id}`)}
              className="w-full text-center text-sm font-medium text-teal hover:opacity-80"
            >
              Ver factura →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
