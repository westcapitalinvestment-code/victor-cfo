"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatFecha } from "@/lib/format";

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
  clients: { name: string; email: string | null; telefono: string | null; tax_id: string | null } | null;
  business_entities: {
    name: string;
    ein: string | null;
    municipio: string | null;
    phone: string | null;
    address: string | null;
    zip: string | null;
    invoice_footer: string | null;
  } | null;
};

const EXTENSIONES_IMAGEN = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"];
function esImagen(nombre: string): boolean {
  const n = nombre.toLowerCase();
  return EXTENSIONES_IMAGEN.some((ext) => n.endsWith(ext));
}

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
  negocioNombre,
}: {
  factura: Factura;
  items: Item[];
  adjuntosIniciales: Adjunto[];
  negocioNombre: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState(METODOS_PAGO[0]);
  const [confirmandoPago, setConfirmandoPago] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

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
    // Sin el monto en el mensaje a propósito (pedido de Joel) — que el
    // cliente lo descubra al abrir el documento, no antes. El link manda
    // directo al PDF, que ya trae el detalle completo de lo que justifica
    // el precio.
    const linkPDF = `${window.location.origin}/api/facturas/${factura.id}/pdf`;
    const vencePart = factura.fecha_vencimiento ? ` Vence el ${formatFecha(factura.fecha_vencimiento)}.` : "";
    const mensajeConLink = `Hola ${clienteNombre}, aquí tienes tu factura ${factura.numero}${
      entidadNombre ? ` de ${entidadNombre}` : ""
    }.${vencePart} Aquí la puedes ver: ${linkPDF} ¡Gracias por tu confianza!`;
    const destino = factura.clients?.telefono ? telefonoWhatsapp(factura.clients.telefono) : "";
    const url = `https://wa.me/${destino}?text=${encodeURIComponent(mensajeConLink)}`;
    window.open(url, "_blank");
  }

  // PDF real generado en el servidor (app/api/facturas/[id]/pdf) — no es
  // una captura de pantalla ni window.print(), es un documento limpio
  // armado con pdf-lib. El link es público (por UUID) para que también
  // funcione cuando se comparte por WhatsApp sin que el cliente tenga que
  // iniciar sesión.
  function urlPDF() {
    return `${window.location.origin}/api/facturas/${factura.id}/pdf`;
  }

  async function eliminarFactura() {
    if (!confirmarEliminar) {
      setConfirmarEliminar(true);
      return;
    }
    setEliminando(true);
    setError(null);
    const { error: deleteError } = await supabase.from("invoices").delete().eq("id", factura.id);
    setEliminando(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.push("/dashboard/facturacion");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Estilos de impresión — "Enviar a impresora > Guardar como PDF" en
          el navegador queda como una forma gratis de exportar la factura
          sin añadir ninguna librería nueva. Solo se ve la tarjeta de la
          factura; se esconde todo lo demás (nav, botones, subida de
          archivos, etc). */}
      <style>{`
        @media print {
          .no-imprimir { display: none !important; }
          .factura-imprimible {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <div className="no-imprimir mb-6 flex items-center justify-between">
        <button onClick={() => router.push("/dashboard/facturacion")} className="text-sm text-muted hover:opacity-80">
          ← Facturas
        </button>
      </div>

      <div className="vc-card factura-imprimible flex flex-col gap-3">
        {error && <p className="no-imprimir text-xs text-red">{error}</p>}

        <div className="border-b border-border pb-3">
          <p className="text-sm font-medium">{negocioNombre || entidadNombre}</p>
          {entidadNombre && negocioNombre && entidadNombre !== negocioNombre && (
            <p className="text-xs text-muted">{entidadNombre}</p>
          )}
          {factura.business_entities?.ein && (
            <p className="text-xs text-muted">RUC/EIN: {factura.business_entities.ein}</p>
          )}
          {factura.business_entities?.address && (
            <p className="text-xs text-muted">{factura.business_entities.address}</p>
          )}
          {factura.business_entities?.municipio && (
            <p className="text-xs text-muted">
              {factura.business_entities.municipio}, PR{factura.business_entities.zip ? ` ${factura.business_entities.zip}` : ""}
            </p>
          )}
          {factura.business_entities?.phone && (
            <p className="text-xs text-muted">{factura.business_entities.phone}</p>
          )}
        </div>

        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-medium">{factura.numero}</p>
            <p className="text-xs text-muted">
              {clienteNombre} {entidadNombre && `· ${entidadNombre}`}
            </p>
            {factura.clients?.email && <p className="text-xs text-muted">{factura.clients.email}</p>}
            {factura.clients?.tax_id && <p className="text-xs text-muted">RUC: {factura.clients.tax_id}</p>}
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
          <span>Emitida: {formatFecha(factura.fecha_emision)}</span>
          {factura.fecha_vencimiento && <span>Vence: {formatFecha(factura.fecha_vencimiento)}</span>}
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

        {factura.business_entities?.invoice_footer && (
          <div>
            <p className="text-xs text-muted">{factura.business_entities.invoice_footer}</p>
          </div>
        )}

        {factura.late_fee_habilitado && (
          <p className="text-xs text-amb">
            Recargo por mora: {factura.late_fee_tipo === "porcentaje" ? `${factura.late_fee_monto}%` : formatMoney(factura.late_fee_monto)}
            {" "}
            después de {factura.late_fee_dias_gracia} días de vencida (referencia — no se suma solo al total).
          </p>
        )}

        {adjuntos.length > 0 && (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Evidencia del trabajo</p>
            <div className="grid grid-cols-3 gap-2">
              {adjuntos.map((a) => (
                <div key={a.id} className="relative overflow-hidden rounded-lg border border-border">
                  <a href={`/api/facturas/adjuntos/${a.id}/ver`} target="_blank" rel="noopener noreferrer" className="block">
                    {esImagen(a.nombre_archivo) ? (
                      <img
                        src={`/api/facturas/adjuntos/${a.id}/ver`}
                        alt={a.nombre_archivo}
                        className="h-20 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-full items-center justify-center bg-bg">
                        <i className="ti ti-file-text text-2xl text-muted" />
                      </div>
                    )}
                    <p className="truncate border-t border-border bg-card px-1.5 py-1 text-[10px] text-muted">
                      {a.nombre_archivo}
                    </p>
                  </a>
                  <button
                    type="button"
                    className="no-imprimir absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-50"
                    disabled={borrandoId === a.id}
                    onClick={() => borrarEvidencia(a.id)}
                    title="Eliminar"
                  >
                    <i className="ti ti-x" style={{ fontSize: 12 }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="no-imprimir">
          {adjuntos.length === 0 && <p className="mb-1 text-xs uppercase tracking-wide text-muted">Evidencia del trabajo</p>}
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

        <div className="no-imprimir grid grid-cols-4 gap-2 border-t border-border pt-3">
          <a
            href={`/api/facturas/${factura.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs font-medium hover:opacity-80"
          >
            <i className="ti ti-file-download text-base" /> PDF
          </a>
          <button
            onClick={enviarPorWhatsapp}
            className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs font-medium hover:opacity-80"
          >
            <i className="ti ti-brand-whatsapp text-base" /> Reenviar
          </button>
          {factura.estado !== "pagada" ? (
            <Link
              href={`/dashboard/facturacion/${factura.id}/editar`}
              className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs font-medium hover:opacity-80"
            >
              <i className="ti ti-edit text-base" /> Editar
            </Link>
          ) : (
            <span className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs font-medium text-muted opacity-40">
              <i className="ti ti-edit text-base" /> Editar
            </span>
          )}
          <button
            onClick={eliminarFactura}
            disabled={eliminando}
            className="flex flex-col items-center gap-1 rounded-lg border border-red py-2 text-xs font-medium text-red hover:opacity-80 disabled:opacity-50"
          >
            <i className="ti ti-trash text-base" /> {eliminando ? "..." : confirmarEliminar ? "¿Seguro?" : "Eliminar"}
          </button>
        </div>

        {factura.estado !== "pagada" && (
          <div className="no-imprimir flex flex-col gap-2 border-t border-border pt-3">
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
