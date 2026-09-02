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
  service_id: string | null;
};

type Adjunto = { id: string; nombre_archivo: string };

type Cotizacion = {
  id: string;
  numero: string;
  subtotal: number;
  ivu_pct: number;
  ivu_monto: number;
  total: number;
  deposito_monto: number | null;
  estado: string;
  pendiente_revision_tecnico: boolean;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  notas: string | null;
  invoice_id: string | null;
  entity_id: string | null;
  client_id: string | null;
  technician_id: string | null;
  clients: { name: string; email: string | null; telefono: string | null; es_negocio: boolean; retention_pct: number } | null;
  technicians: { name: string } | null;
  business_entities: {
    name: string;
    invoice_prefix: string;
    invoice_start_number: number;
    default_payment_terms: string;
    ein: string | null;
    municipio: string | null;
    phone: string | null;
    address: string | null;
    zip: string | null;
    invoice_footer: string | null;
    ivu_applies: boolean;
  } | null;
};

// Mismo helper que en factura-detalle.tsx.
function telefonoWhatsapp(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length === 10) return `1${digitos}`;
  return digitos;
}

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
  adjuntosIniciales,
  conteoFacturas,
}: {
  cotizacion: Cotizacion;
  items: Item[];
  adjuntosIniciales: Adjunto[];
  conteoFacturas: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adjuntos, setAdjuntos] = useState(adjuntosIniciales);
  const [subiendo, setSubiendo] = useState(false);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const inputCamaraRef = useRef<HTMLInputElement>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  const clienteNombre = cotizacion.clients?.name ?? "Sin cliente";
  const entidadNombre = cotizacion.business_entities?.name ?? "";

  async function subirEvidencia(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setSubiendo(true);
    setError(null);

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("cotizacionId", cotizacion.id);

      const res = await fetch("/api/cotizaciones/adjuntos/upload", { method: "POST", body: formData });
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
    const res = await fetch(`/api/cotizaciones/adjuntos/${id}`, { method: "DELETE" });
    setBorrandoId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo eliminar el archivo.");
      return;
    }
    setAdjuntos((prev) => prev.filter((a) => a.id !== id));
  }

  function enviarPorWhatsapp() {
    // Sin el monto en el mensaje a propósito — que lo vea al abrir el PDF,
    // que ya explica el detalle de lo cotizado.
    const linkPDF = `${window.location.origin}/api/cotizaciones/${cotizacion.id}/pdf`;
    const validaPart = cotizacion.fecha_vencimiento ? ` Válida hasta el ${formatFecha(cotizacion.fecha_vencimiento)}.` : "";
    const mensaje = `Hola ${clienteNombre}, preparé tu cotización ${cotizacion.numero}${
      entidadNombre ? ` de ${entidadNombre}` : ""
    } con todo lo que conversamos.${validaPart} Aquí la puedes ver: ${linkPDF} Cualquier pregunta, aquí estoy.`;
    const destino = cotizacion.clients?.telefono ? telefonoWhatsapp(cotizacion.clients.telefono) : "";
    const url = `https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  }

  // Aprobar/rechazar una cotización que el TÉCNICO armó desde cero, desde
  // el detalle mismo (2 sept 2026) — atajo equivalente al que ya existe en
  // el Panel de Equipo, para cuando entras directo desde el link.
  async function aprobarDeTecnico() {
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("cotizaciones")
      .update({ estado: "enviada", pendiente_revision_tecnico: false })
      .eq("id", cotizacion.id);
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  async function rechazarDeTecnico() {
    if (!window.confirm(`¿Rechazar esta cotización de ${cotizacion.technicians?.name ?? "el técnico"}? No se le va a mandar al cliente.`)) return;
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("cotizaciones")
      .update({ estado: "rechazada", pendiente_revision_tecnico: false })
      .eq("id", cotizacion.id);
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

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
        // El depósito requerido en la cotización pasa tal cual a la
        // factura — si el cliente ya lo pagó al aprobar, esto deja el
        // balance correcto desde que nace la factura (2 sept 2026, pedido
        // de Joel).
        deposito_monto: cotizacion.deposito_monto ?? 0,
        // Si la cotización ya tenía un técnico asignado, la factura nace
        // con el mismo vínculo (Equipo, 2 sept 2026, pedido de Joel) — así
        // el trabajo sigue apareciendo en su Panel/Reportes de Equipo
        // aunque hayas hecho tú mismo la conversión en vez de que él la
        // convirtiera desde su app.
        technician_id: cotizacion.technician_id,
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
        service_id: it.service_id,
        descripcion: it.descripcion,
        detalle: it.detalle,
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

  // Eliminar cotización (2 sept 2026, pedido de Joel: "estoy en modo de
  // prueba e hice algo y no puedo borrarlo") — bloqueado si ya se convirtió
  // en factura (tiene invoice_id), porque esa factura real ya vive
  // independiente y borrar la cotización dejaría la nota "Convertida de
  // cotización X" apuntando a un registro que ya no existe. En ese caso hay
  // que borrar la factura, no la cotización.
  async function eliminarCotizacion() {
    if (cotizacion.invoice_id) return;
    if (!confirmarEliminar) {
      setConfirmarEliminar(true);
      return;
    }
    setEliminando(true);
    setError(null);
    const { error: deleteError } = await supabase.from("cotizaciones").delete().eq("id", cotizacion.id);
    setEliminando(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.push("/dashboard/facturacion?tab=cotizaciones");
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

        {/* Ni el nombre personal del dueño ni el RUC/EIN van en la cotización
            (pedido de Joel, 1 sept 2026) — solo la identidad del negocio. */}
        {(cotizacion.business_entities?.address ||
          cotizacion.business_entities?.municipio ||
          cotizacion.business_entities?.phone) && (
          <div className="border-b border-border pb-3">
            <p className="text-sm font-medium">{entidadNombre}</p>
            {cotizacion.business_entities?.address && (
              <p className="text-xs text-muted">{cotizacion.business_entities.address}</p>
            )}
            {cotizacion.business_entities?.municipio && (
              <p className="text-xs text-muted">
                {cotizacion.business_entities.municipio}, PR
                {cotizacion.business_entities.zip ? ` ${cotizacion.business_entities.zip}` : ""}
              </p>
            )}
            {cotizacion.business_entities?.phone && (
              <p className="text-xs text-muted">{cotizacion.business_entities.phone}</p>
            )}
          </div>
        )}

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
          <span>Emitida: {formatFecha(cotizacion.fecha_emision)}</span>
          {cotizacion.fecha_vencimiento && <span>Válida hasta: {formatFecha(cotizacion.fecha_vencimiento)}</span>}
        </div>

        {cotizacion.pendiente_revision_tecnico ? (
          <div className="rounded-lg border p-2.5 text-xs" style={{ borderColor: "#F5A623", background: "rgba(245,166,35,.06)" }}>
            <p className="mb-2">
              <i className="ti ti-clock-hour-4 text-amb" style={{ marginRight: 4 }} />
              <strong>{cotizacion.technicians?.name ?? "El técnico"}</strong> cotizó esto en campo — pendiente de que la
              apruebes antes de que le llegue al cliente.
            </p>
            <div className="flex gap-2">
              <button className="vc-btn-primary flex-1" style={{ width: "auto" }} disabled={loading} onClick={aprobarDeTecnico}>
                {loading ? "..." : "Aprobar y enviar"}
              </button>
              <button
                className="flex-shrink-0 rounded-lg border border-red/40 px-3 py-2 text-xs font-medium text-red"
                disabled={loading}
                onClick={rechazarDeTecnico}
              >
                Rechazar
              </button>
            </div>
          </div>
        ) : (
          cotizacion.technicians &&
          cotizacion.estado !== "convertida" && (
            <div className="rounded-lg border border-teal/30 bg-teal/[.05] p-2.5 text-xs">
              <i className="ti ti-user-check text-teal" style={{ marginRight: 4 }} />
              Asignada a <strong>{cotizacion.technicians.name}</strong>
              {cotizacion.estado === "aprobada" && " — la puede convertir él mismo en factura desde su app cuando la haga."}
            </div>
          )
        )}

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
            <span>{formatMoney(cotizacion.subtotal)}</span>
          </div>
          {cotizacion.business_entities?.ivu_applies && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted">IVU ({cotizacion.ivu_pct}%)</span>
              <span>+{formatMoney(cotizacion.ivu_monto)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
            <span>Total</span>
            <span>{formatMoney(cotizacion.total)}</span>
          </div>
          {Number(cotizacion.deposito_monto) > 0 && (
            <>
              <div className="flex justify-between py-0.5">
                <span className="text-muted">Depósito requerido</span>
                <span>-{formatMoney(Number(cotizacion.deposito_monto))}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
                <span>Balance al aprobar</span>
                <span>{formatMoney(cotizacion.total - Number(cotizacion.deposito_monto))}</span>
              </div>
            </>
          )}
        </div>

        {cotizacion.notas && (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Notas</p>
            <p className="text-sm text-text">{cotizacion.notas}</p>
          </div>
        )}

        {cotizacion.business_entities?.invoice_footer && (
          <div>
            <p className="text-xs text-muted">{cotizacion.business_entities.invoice_footer}</p>
          </div>
        )}

        {adjuntos.length > 0 && (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Evidencia / documentos</p>
            <div className="grid grid-cols-3 gap-2">
              {adjuntos.map((a) => (
                <div key={a.id} className="relative overflow-hidden rounded-lg border border-border">
                  <a href={`/api/cotizaciones/adjuntos/${a.id}/ver`} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="flex h-20 w-full items-center justify-center bg-bg">
                      <i className="ti ti-file-text text-2xl text-muted" />
                    </div>
                    <p className="truncate border-t border-border bg-card px-1.5 py-1 text-[10px] text-muted">{a.nombre_archivo}</p>
                  </a>
                  <button
                    type="button"
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-50"
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

        <div>
          {adjuntos.length === 0 && <p className="mb-1 text-xs uppercase tracking-wide text-muted">Evidencia / documentos</p>}
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

        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          <a
            href={`/api/cotizaciones/${cotizacion.id}/pdf`}
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
            <i className="ti ti-brand-whatsapp text-base" /> WhatsApp
          </button>
          {cotizacion.estado !== "convertida" ? (
            <Link
              href={`/dashboard/facturacion/cotizaciones/${cotizacion.id}/editar`}
              className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs font-medium hover:opacity-80"
            >
              <i className="ti ti-edit text-base" /> Editar
            </Link>
          ) : (
            <span className="flex flex-col items-center gap-1 rounded-lg border border-border py-2 text-xs font-medium text-muted opacity-40">
              <i className="ti ti-edit text-base" /> Editar
            </span>
          )}
        </div>

        {!cotizacion.invoice_id && (
          <button
            onClick={eliminarCotizacion}
            disabled={eliminando}
            title="Eliminar"
            className={`flex items-center justify-center gap-1 rounded-lg border py-2 text-xs font-medium hover:opacity-80 ${
              confirmarEliminar ? "border-red bg-red/[.06] text-red" : "border-border text-muted"
            }`}
          >
            <i className="ti ti-trash text-base" /> {eliminando ? "..." : confirmarEliminar ? "¿Seguro? Confirmar eliminar" : "Eliminar cotización"}
          </button>
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
