"use client";

import { useRef, useState } from "react";
import Link from "next/link";
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

type Adjunto = { id: string; nombre_archivo: string };

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
  metodos_cobro_aceptados: string[] | null;
  late_fee_habilitado: boolean;
  late_fee_tipo: string | null;
  late_fee_monto: number;
  late_fee_dias_gracia: number;
  clients: { name: string; email: string | null; telefono: string | null } | null;
  business_entities: { name: string } | null;
};

const METODOS_PAGO = ["ATH Móvil", "Transferencia", "Cheque", "Efectivo", "Tarjeta", "Otro"];

function hoyVencida(f: Factura): boolean {
  return f.estado !== "pagada" && f.estado !== "borrador" && !!f.fecha_vencimiento && f.fecha_vencimiento < new Date().toISOString().slice(0, 10);
}

// Convierte cualquier formato de teléfono guardado (787-555-0123, (787)
// 555-0123, etc.) en solo dígitos con código de país para el link de
// WhatsApp — si ya trae 10 dígitos (área de PR/EEUU) le antepone el "1".
function telefonoWhatsapp(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length === 10) return `1${digitos}`;
  return digitos;
}

export default function FacturaDetalle({
  factura,
  items,
  adjuntosIniciales,
}: {
  factura: Factura;
  items: Item[];
  adjuntosIniciales: Adjunto[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState(METODOS_PAGO[0]);
  const [confirmandoPago, setConfirmandoPago] = useState(false);

  const [adjuntos, setAdjuntos] = useState(adjuntosIniciales);
  const [subiendo, setSubiendo] = useState(false);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const inputCamaraRef = useRef<HTMLInputElement>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

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

  async function subirEvidencia(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setSubiendo(true);
    setError(null);

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("invoiceId", factura.id);

      const res = await fetch("/api/facturas/adjuntos/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "No se pudo subir el archivo.");
        continue;
      }
      setAdjuntos((prev) => [...prev, { id: data.id, nombre_archivo: file.name }]);
    }

    setSubiendo(false);
  }

  async function borrarEvidencia(id: string) {
    setBorrandoId(id);
    setError(null);
    const res = await fetch(`/api/facturas/adjuntos/${id}`, { method: "DELETE" });
    setBorrandoId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo eliminar el archivo.");
      return;
    }
    setAdjuntos((prev) => prev.filter((a) => a.id !== id));
  }

  async function enviarPorWhatsapp() {
    if (factura.estado === "borrador") {
      await actualizarEstado("enviada");
    }
    const mensaje = `Hola ${clienteNombre}, aquí tienes tu factura ${factura.numero}${
      entidadNombre ? ` de ${entidadNombre}` : ""
    } por ${formatMoney(factura.total)}.${factura.fecha_vencimiento ? ` Vence el ${factura.fecha_vencimiento}.` : ""} ¡Gracias!`;
    const destino = factura.clients?.telefono ? telefonoWhatsapp(factura.clients.telefono) : "";
    const url = `https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
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

        {factura.metodos_cobro_aceptados && factura.metodos_cobro_aceptados.length > 0 && (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Métodos de cobro aceptados</p>
            <div className="flex flex-wrap gap-1.5">
              {factura.metodos_cobro_aceptados.map((m) => (
                <span key={m} className="rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal">
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        {factura.late_fee_habilitado && (
          <p className="text-xs text-amb">
            Recargo por mora: {factura.late_fee_tipo === "porcentaje" ? `${factura.late_fee_monto}%` : formatMoney(factura.late_fee_monto)}
            {" "}
            después de {factura.late_fee_dias_gracia} días de vencida (referencia — no se suma solo al total).
          </p>
        )}

        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">Evidencia del trabajo</p>

          {adjuntos.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1">
              {adjuntos.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                  <span className="truncate">{a.nombre_archivo}</span>
                  <span className="flex flex-shrink-0 items-center gap-3 text-xs">
                    <a
                      href={`/api/facturas/adjuntos/${a.id}/ver`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-teal underline"
                    >
                      Ver
                    </a>
                    <button
                      type="button"
                      className="font-medium text-red underline disabled:opacity-50"
                      disabled={borrandoId === a.id}
                      onClick={() => borrarEvidencia(a.id)}
                    >
                      {borrandoId === a.id ? "..." : "Eliminar"}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <input ref={inputCamaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={subirEvidencia} />
          <input ref={inputArchivoRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={subirEvidencia} />

          <div className="flex gap-2">
            <button
              type="button"
              disabled={subiendo}
              className="flex-1 rounded-pill border border-border py-2 text-sm font-medium hover:opacity-80 disabled:opacity-50"
              onClick={() => inputCamaraRef.current?.click()}
            >
              📷 Foto
            </button>
            <button
              type="button"
              disabled={subiendo}
              className="flex-1 rounded-pill border border-border py-2 text-sm font-medium hover:opacity-80 disabled:opacity-50"
              onClick={() => inputArchivoRef.current?.click()}
            >
              📁 {subiendo ? "Subiendo..." : "Añadir"}
            </button>
          </div>
        </div>

        {factura.metodo_pago && (
          <p className="text-xs text-muted">Pagada vía {factura.metodo_pago}</p>
        )}

        <div className="flex gap-2 border-t border-border pt-3">
          <button onClick={enviarPorWhatsapp} className="vc-btn-secondary flex-1">
            <i className="ti ti-brand-whatsapp" /> Enviar por WhatsApp
          </button>
          {factura.estado !== "pagada" && (
            <Link
              href={`/dashboard/facturacion/${factura.id}/editar`}
              className="flex flex-shrink-0 items-center justify-center gap-1 rounded-pill border border-border px-4 text-sm font-medium hover:opacity-80"
            >
              <i className="ti ti-edit" /> Editar
            </Link>
          )}
        </div>

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
