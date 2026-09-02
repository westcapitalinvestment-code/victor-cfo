"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatFecha } from "@/lib/format";

type Item = {
  id: string;
  descripcion: string;
  detalle: string | null;
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
  deposito_monto: number | null;
  estado: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  metodo_pago: string | null;
  // Fecha real en que llegó el pago (migración 0046) — distinta de
  // fecha_emision. Nula en facturas marcadas pagadas antes de este campo
  // existir.
  fecha_pago: string | null;
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
    ivu_applies: boolean;
  } | null;
};

const EXTENSIONES_IMAGEN = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"];
function esImagen(nombre: string): boolean {
  const n = nombre.toLowerCase();
  return EXTENSIONES_IMAGEN.some((ext) => n.endsWith(ext));
}

// "ATH Móvil" = transferencia personal normal, sin fee. "ATH Móvil Business"
// = cobrado por el pATH de la entidad, con fee de 2.25% (mín. $0.06). Antes
// de esta separación (2 sept 2026) no había forma de distinguir un pago real
// entre los dos, y "Gasto procesamiento de pagos" le inventaba un fee a
// pagos ATH que en realidad fueron personales.
const METODOS_PAGO = ["ATH Móvil", "ATH Móvil Business", "Transferencia", "Cheque", "Efectivo", "Tarjeta", "Otro"];

// Mismos datos que en Nueva/Editar Factura y en "Gasto procesamiento de
// pagos" — al registrar el pago aquí (2 sept 2026, pedido de Joel: "debe
// cambiar arriba y añadir esos $[fee] de fee pq no hay manera de
// ajustarlo") se muestra de una vez cuánto se va a descontar según el
// método elegido, para que no sea sorpresa después en Reportes.
const ATH_FEE_PCT = 0.0225;
const ATH_FEE_MINIMO = 0.06;
const STRIPE_FEE_PCT = 0.029;
const STRIPE_FEE_FIJO = 0.3;
function feeEstimadoPago(total: number, metodo: string): number {
  if (metodo === "ATH Móvil Business") return Math.max(total * ATH_FEE_PCT, ATH_FEE_MINIMO);
  if (metodo === "Tarjeta") return total * STRIPE_FEE_PCT + STRIPE_FEE_FIJO;
  return 0;
}

function hoyVencida(f: Factura): boolean {
  return f.estado !== "pagada" && f.estado !== "borrador" && !!f.fecha_vencimiento && f.fecha_vencimiento < new Date().toISOString().slice(0, 10);
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
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
  basePath = "/dashboard/facturacion",
  modoAdmin = false,
}: {
  factura: Factura;
  items: Item[];
  adjuntosIniciales: Adjunto[];
  negocioNombre: string;
  basePath?: string;
  // Editar/Eliminar factura no están en el acceso base que Joel definió
  // para Admin/Secretaria ("Ver y crear facturas/cotizaciones, Registrar
  // pagos y cobros") — se esconden en modoAdmin en vez de dejar un link
  // roto (la ruta /editar todavía no existe bajo /admin) o exponer un
  // borrado que no le corresponde a un admin.
  modoAdmin?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState(METODOS_PAGO[0]);
  // Fecha real del pago (2 sept 2026, pedido de Joel: "el pago salio el dia
  // 1 pero me pago el dia 2 y tal como esta sale que todos pagaran el dia
  // 1") — por defecto hoy, pero editable porque el pago pudo haber llegado
  // otro día.
  const [fechaPago, setFechaPago] = useState(hoyISO());
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

  async function actualizarEstado(nuevoEstado: string, extra?: { metodo_pago?: string; fecha_pago?: string }) {
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
    router.push(basePath);
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
        <button onClick={() => router.push(basePath)} className="text-sm text-muted hover:opacity-80">
          ← Facturas
        </button>
      </div>

      <div className="vc-card factura-imprimible flex flex-col gap-3">
        {error && <p className="no-imprimir text-xs text-red">{error}</p>}

        {/* Ni el nombre personal del dueño ni el RUC/EIN van en la factura
            (pedido de Joel, 1 sept 2026) — solo la identidad del negocio. */}
        <div className="border-b border-border pb-3">
          <p className="text-sm font-medium">{entidadNombre}</p>
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
                {it.detalle && <p className="text-xs text-muted">{it.detalle}</p>}
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
          {factura.business_entities?.ivu_applies && (
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
          {factura.estado === "pagada" ? (
            // Factura pagada (2 sept 2026, pedido de Joel, calcado de
            // FreshBooks: "Amount Paid" + "Amount Due $0.00") — en vez de
            // seguir mostrando el total como si se debiera, se muestra lo
            // que de verdad importa: cuánto se pagó y que el balance es
            // $0.00. Reemplaza la ruptura de depósito, que ya no aplica una
            // vez la factura está completamente cobrada.
            <>
              <div className="flex justify-between py-0.5">
                <span className="text-muted">Monto pagado</span>
                <span className="text-teal">{formatMoney(factura.total)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
                <span>Balance</span>
                <span className="text-teal">{formatMoney(0)}</span>
              </div>
            </>
          ) : (
            Number(factura.deposito_monto) > 0 && (
              <>
                <div className="flex justify-between py-0.5">
                  <span className="text-muted">Depósito recibido</span>
                  <span>-{formatMoney(Number(factura.deposito_monto))}</span>
                </div>
                <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
                  <span>Balance a pagar</span>
                  <span>{formatMoney(factura.total - Number(factura.deposito_monto))}</span>
                </div>
              </>
            )
          )}
        </div>

        {factura.metodo_pago && (
          <div className="flex items-center gap-2 rounded-lg border border-teal/30 bg-teal/[.05] px-3 py-2 text-xs">
            <i className="ti ti-check text-teal" />
            <span>
              Pagada vía <strong>{factura.metodo_pago}</strong>
              {factura.fecha_pago && ` el ${formatFecha(factura.fecha_pago)}`}
            </span>
          </div>
        )}

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

        <div className={`no-imprimir grid gap-2 border-t border-border pt-3 ${modoAdmin ? "grid-cols-2" : "grid-cols-4"}`}>
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
          {!modoAdmin && factura.estado !== "pagada" && (
            <Link
              href={`${basePath}/${factura.id}/editar`}
              className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs font-medium hover:opacity-80"
            >
              <i className="ti ti-edit text-base" /> Editar
            </Link>
          )}
          {!modoAdmin && factura.estado === "pagada" && (
            <span className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs font-medium text-muted opacity-40">
              <i className="ti ti-edit text-base" /> Editar
            </span>
          )}
          {!modoAdmin && (
            <button
              onClick={eliminarFactura}
              disabled={eliminando}
              className="flex flex-col items-center gap-1 rounded-lg border border-red py-2 text-xs font-medium text-red hover:opacity-80 disabled:opacity-50"
            >
              <i className="ti ti-trash text-base" /> {eliminando ? "..." : confirmarEliminar ? "¿Seguro?" : "Eliminar"}
            </button>
          )}
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
                Registrar pago
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Antes esto marcaba pagada de una vez, sin dar chance de
                    revisar si lo que llegó cuadra con la retención esperada
                    — pedido de Joel (1 sept 2026): a veces el cliente se
                    olvida de retener o retiene mal, y si eso pasa no se debe
                    marcar pagada tal cual, hay que ajustar la factura primero. */}
                <div className="rounded-lg border border-border bg-bg p-3 text-sm">
                  <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Verifica antes de confirmar</p>
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted">Total que debía cobrar</span>
                    <span className="font-medium">{formatMoney(factura.total)}</span>
                  </div>
                  {factura.retencion_pct > 0 && (
                    <div className="flex justify-between py-0.5">
                      <span className="text-amb">Retención ({factura.retencion_pct}%) que el cliente debía depositar</span>
                      <span className="font-medium text-amb">{formatMoney(factura.retencion_monto)}</span>
                    </div>
                  )}
                  {feeEstimadoPago(Number(factura.total), metodoPago) > 0 && (
                    <div className="flex justify-between py-0.5">
                      <span className="text-red">
                        Fee {metodoPago} ({metodoPago === "Tarjeta" ? "2.9% + $0.30" : "2.25%, mín. $0.06"})
                      </span>
                      <span className="font-medium text-red">-{formatMoney(feeEstimadoPago(Number(factura.total), metodoPago))}</span>
                    </div>
                  )}
                </div>
                {!modoAdmin && (
                  <p className="text-xs text-muted">
                    Si lo que recibiste no coincide con esto (el cliente no retuvo, o retuvo mal), no la marques pagada así —{" "}
                    <Link href={`${basePath}/${factura.id}/editar`} className="font-medium text-teal underline">
                      ajústala primero
                    </Link>
                    .
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <select className="vc-input flex-1" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                    {METODOS_PAGO.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {/* Fecha del pago, al lado del método (2 sept 2026) — ver
                      comentario en el useState de fechaPago. width:auto por
                      el mismo bug de vc-input al 100% dentro de un flex row. */}
                  <input
                    type="date"
                    className="vc-input flex-shrink-0"
                    style={{ width: "auto" }}
                    value={fechaPago}
                    onChange={(e) => setFechaPago(e.target.value)}
                  />
                  {/* .vc-btn-primary trae width:100% en globals.css — dentro
                      de este flex row eso gana como flex-basis y aplasta el
                      <select> flex-1 al lado (mismo bug de fondo que el de
                      vc-input; pedido de Joel, 1 sept 2026). El estilo en
                      línea gana siempre sobre la hoja de estilos. */}
                  <button
                    className="vc-btn-primary flex-shrink-0"
                    style={{ width: "auto" }}
                    disabled={loading}
                    onClick={() => actualizarEstado("pagada", { metodo_pago: metodoPago, fecha_pago: fechaPago })}
                  >
                    {loading ? "..." : "Está correcto, confirmar"}
                  </button>
                </div>
                <button
                  className="self-start text-xs text-muted underline"
                  disabled={loading}
                  onClick={() => setConfirmandoPago(false)}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
