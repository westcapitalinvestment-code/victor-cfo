"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

type Entity = { id: string; name: string; ivu_applies: boolean; ivu_rate_estatal: number; ivu_rate_municipal: number };
type Client = {
  id: string;
  name: string;
  entity_id: string | null;
  es_negocio: boolean;
  retention_pct: number;
  ivu_exempt_reseller: boolean;
  telefono: string | null;
};
type ServicioCat = { id: string; nombre: string; tipo: string; precio: number; ivu_exento: boolean };

type Factura = {
  id: string;
  entity_id: string | null;
  client_id: string | null;
  servicio_id: string | null;
  numero: string;
  estado: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  notas: string | null;
  metodos_cobro_aceptados: string[] | null;
  late_fee_habilitado: boolean;
  late_fee_tipo: string | null;
  late_fee_monto: number;
  late_fee_dias_gracia: number;
  es_recurrente: boolean;
  frecuencia_recurrente: string | null;
};



const METODOS_COBRO = ["ATH Móvil", "Transferencia / ACH", "Cheque", "Efectivo"];
const STRIPE_FEE_PCT = 0.029;
const STRIPE_FEE_FIJO = 0.3;

export default function EditarFacturaForm({
  factura,
  itemInicial,
  entities,
  clients,
  servicios,
}: {
  factura: Factura;
  itemInicial: { id: string; descripcion: string; precio_unitario: number; cantidad: number };
  entities: Entity[];
  clients: Client[];
  servicios: ServicioCat[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [entityId, setEntityId] = useState(factura.entity_id ?? entities[0]?.id ?? "");
  const entidad = entities.find((e) => e.id === entityId) ?? entities[0];

  const clientesDeEntidad = useMemo(
    () => clients.filter((c) => !c.entity_id || c.entity_id === entityId),
    [clients, entityId]
  );
  const [clientId, setClientId] = useState(factura.client_id ?? clientesDeEntidad[0]?.id ?? "");
  const cliente = clientesDeEntidad.find((c) => c.id === clientId) ?? clientesDeEntidad[0];

  const servicioOriginalSigueActivo = factura.servicio_id && servicios.some((s) => s.id === factura.servicio_id);
  const [servicioId, setServicioId] = useState<string>(
    servicioOriginalSigueActivo ? (factura.servicio_id as string) : "personalizado"
  );
  const servicio = servicios.find((s) => s.id === servicioId);
  const [descripcionPersonalizada, setDescripcionPersonalizada] = useState(
    servicioOriginalSigueActivo ? "" : itemInicial.descripcion
  );
  const [monto, setMonto] = useState(String(itemInicial.precio_unitario));
  const [cantidad, setCantidad] = useState(String(itemInicial.cantidad || 1));

  function elegirServicio(id: string) {
    setServicioId(id);
    const s = servicios.find((x) => x.id === id);
    if (s) setMonto(String(s.precio));
  }

  const [metodosCobro, setMetodosCobro] = useState<string[]>(factura.metodos_cobro_aceptados ?? []);
  function toggleMetodo(m: string) {
    setMetodosCobro((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  const [moraTipo, setMoraTipo] = useState<"ninguno" | "fijo" | "porcentaje">(
    factura.late_fee_habilitado ? ((factura.late_fee_tipo as "fijo" | "porcentaje") ?? "fijo") : "ninguno"
  );
  const [moraMonto, setMoraMonto] = useState(String(factura.late_fee_monto ?? ""));
  const [moraDias, setMoraDias] = useState(String(factura.late_fee_dias_gracia ?? "10"));

  const [recurrencia, setRecurrencia] = useState<"unica" | "semanal" | "quincenal" | "mensual">(
    factura.es_recurrente ? ((factura.frecuencia_recurrente as "semanal" | "quincenal" | "mensual") ?? "mensual") : "unica"
  );

  const [fechaFactura, setFechaFactura] = useState(factura.fecha_emision);
  const [fechaVencimiento, setFechaVencimiento] = useState(factura.fecha_vencimiento ?? factura.fecha_emision);
  const [notas, setNotas] = useState(factura.notas ?? "");
  const [loading, setLoading] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descripcionFinal = servicioId === "personalizado" ? descripcionPersonalizada : servicio?.nombre ?? "";
  const precioUnitarioNum = Number(monto) || 0;
  const cantidadNum = Number(cantidad) || 1;
  const montoNum = precioUnitarioNum * cantidadNum;

  const ivuExentoServicio = servicioId !== "personalizado" && servicio ? servicio.ivu_exento : true;
  const ivuPct =
    entidad?.ivu_applies && !cliente?.ivu_exempt_reseller && !ivuExentoServicio
      ? Number(entidad.ivu_rate_estatal || 0) + Number(entidad.ivu_rate_municipal || 0)
      : 0;
  const subtotal = montoNum;
  const ivuMonto = subtotal * (ivuPct / 100);
  const retencionPct = cliente?.es_negocio ? Number(cliente.retention_pct || 0) : 0;
  const retencionMonto = subtotal * (retencionPct / 100);
  const total = subtotal + ivuMonto - retencionMonto;
  const feeStripeEstimado = (subtotal + ivuMonto) * STRIPE_FEE_PCT + STRIPE_FEE_FIJO;

  function avanzarFecha(fechaISO: string, frecuencia: string): string {
    const d = new Date(`${fechaISO}T00:00:00Z`);
    if (frecuencia === "semanal") d.setUTCDate(d.getUTCDate() + 7);
    else if (frecuencia === "quincenal") d.setUTCDate(d.getUTCDate() + 15);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  }

  async function guardar() {
    if (!entidad || !cliente) return;
    if (!descripcionFinal.trim() || montoNum <= 0) {
      setError("Elige un servicio (o describe uno personalizado) y pon un monto mayor a $0.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        entity_id: entidad.id,
        client_id: cliente.id,
        servicio_id: servicioId !== "personalizado" ? servicioId : null,
        subtotal,
        ivu_pct: ivuPct,
        ivu_monto: ivuMonto,
        retencion_pct: retencionPct,
        retencion_monto: retencionMonto,
        total,
        fecha_emision: fechaFactura,
        fecha_vencimiento: fechaVencimiento,
        notas: notas || null,
        metodos_cobro_aceptados: metodosCobro,
        late_fee_habilitado: moraTipo !== "ninguno",
        late_fee_tipo: moraTipo !== "ninguno" ? moraTipo : null,
        late_fee_monto: moraTipo !== "ninguno" ? Number(moraMonto) || 0 : 0,
        late_fee_dias_gracia: moraTipo !== "ninguno" ? Number(moraDias) || 0 : 0,
        es_recurrente: recurrencia !== "unica",
        frecuencia_recurrente: recurrencia !== "unica" ? recurrencia : null,
        fecha_proxima_generacion: recurrencia !== "unica" ? avanzarFecha(fechaFactura, recurrencia) : null,
      })
      .eq("id", factura.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    if (itemInicial.id) {
      const { error: itemError } = await supabase
        .from("invoice_items")
        .update({ descripcion: descripcionFinal, cantidad: cantidadNum, precio_unitario: precioUnitarioNum, subtotal_linea: montoNum })
        .eq("id", itemInicial.id);
      if (itemError) {
        setLoading(false);
        setError(itemError.message);
        return;
      }
    } else {
      const { error: itemError } = await supabase.from("invoice_items").insert({
        invoice_id: factura.id,
        descripcion: descripcionFinal,
        cantidad: cantidadNum,
        precio_unitario: precioUnitarioNum,
        subtotal_linea: montoNum,
      });
      if (itemError) {
        setLoading(false);
        setError(itemError.message);
        return;
      }
    }

    setLoading(false);
    router.push(`/dashboard/facturacion/${factura.id}`);
    router.refresh();
  }

  async function eliminar() {
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Editar factura {factura.numero}</h1>
        <button onClick={() => router.push(`/dashboard/facturacion/${factura.id}`)} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        {entities.length > 1 && (
          <Field label="Entidad">
            <select className="vc-input" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Cliente">
          <select className="vc-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clientesDeEntidad.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.es_negocio && Number(c.retention_pct) > 0 ? ` (Créd. Hacienda ${Number(c.retention_pct)}%)` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Servicio">
          <select className="vc-input" value={servicioId} onChange={(e) => elegirServicio(e.target.value)}>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} — {formatMoney(s.precio)}
              </option>
            ))}
            <option value="personalizado">Personalizado...</option>
          </select>
        </Field>

        {servicioId === "personalizado" && (
          <Field label="Descripción">
            <input
              className="vc-input"
              placeholder="Descripción del servicio"
              value={descripcionPersonalizada}
              onChange={(e) => setDescripcionPersonalizada(e.target.value)}
            />
          </Field>
        )}

        <div className="flex gap-2">
          <Field label="Cantidad">
            <input
              className="vc-input"
              type="number"
              min="1"
              step="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </Field>
          <Field label="Precio unitario">
            <input
              className="vc-input"
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </Field>
        </div>
        {cantidadNum > 1 && (
          <p className="-mt-2 text-xs text-muted">
            Subtotal de esta línea: {cantidadNum} × {formatMoney(precioUnitarioNum)} = {formatMoney(montoNum)}
          </p>
        )}

        <Field label="Métodos de cobro aceptados">
          <div className="flex flex-wrap gap-2">
            {METODOS_COBRO.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => toggleMetodo(m)}
                className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                style={
                  metodosCobro.includes(m)
                    ? { borderColor: "#1D9E75", background: "rgba(29,158,117,.08)", color: "#1D9E75" }
                    : { borderColor: "var(--border)", color: "var(--muted)" }
                }
              >
                {metodosCobro.includes(m) ? "✓ " : ""}
                {m}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Recargo por mora">
          <div className="flex gap-2">
            <select className="vc-input flex-1" value={moraTipo} onChange={(e) => setMoraTipo(e.target.value as typeof moraTipo)}>
              <option value="ninguno">Sin recargo por mora</option>
              <option value="fijo">Monto fijo</option>
              <option value="porcentaje">Porcentaje</option>
            </select>
            {moraTipo !== "ninguno" && (
              <>
                <input
                  className="vc-input w-24 flex-shrink-0"
                  type="number"
                  min="0"
                  step="0.01"
                  value={moraMonto}
                  onChange={(e) => setMoraMonto(e.target.value)}
                />
                <div className="flex flex-shrink-0 items-center gap-1 text-xs text-muted">
                  después de
                  <input
                    className="vc-input w-14"
                    type="number"
                    min="0"
                    step="1"
                    value={moraDias}
                    onChange={(e) => setMoraDias(e.target.value)}
                  />
                  días
                </div>
              </>
            )}
          </div>
        </Field>

        <div className="flex gap-2">
          <Field label="Fecha de factura">
            <input className="vc-input" type="date" value={fechaFactura} onChange={(e) => setFechaFactura(e.target.value)} />
          </Field>
          <Field label="Fecha de vencimiento">
            <input
              className="vc-input"
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
            />
          </Field>
        </div>

        <Field label="¿Es recurrente?">
          <select className="vc-input" value={recurrencia} onChange={(e) => setRecurrencia(e.target.value as typeof recurrencia)}>
            <option value="unica">No — factura única</option>
            <option value="semanal">Sí — se genera cada semana</option>
            <option value="quincenal">Sí — se genera cada quincena</option>
            <option value="mensual">Sí — se genera cada mes</option>
          </select>
        </Field>

        <Field label="Notas para el cliente (opcional)">
          <textarea className="vc-input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Field>

        <div className="rounded-lg border border-teal bg-teal/[.04] p-3 text-sm">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-teal">Vista del cliente</p>
          <div className="flex justify-between py-0.5">
            <span className="text-muted">Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          {ivuMonto > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted">IVU ({ivuPct}%)</span>
              <span>+{formatMoney(ivuMonto)}</span>
            </div>
          )}
          {retencionMonto > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-amb">Retención {retencionPct}% (cliente retiene)</span>
              <span className="text-amb">-{formatMoney(retencionMonto)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-teal/30 pt-1.5 font-medium">
            <span>Total a pagar</span>
            <span className="text-teal">{formatMoney(total)}</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-bg p-3 text-sm">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Solo visible para ti</p>
          {retencionMonto > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted">Retención a tu favor</span>
              <span className="text-teal">+{formatMoney(retencionMonto)}</span>
            </div>
          )}
          <div className="flex justify-between py-0.5">
            <span className="text-muted">Fee Stripe estimado (~2.9% + $0.30)</span>
            <span className="text-red">-{formatMoney(feeStripeEstimado)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
            <span>Recibirías si el cliente paga con tarjeta</span>
            <span>{formatMoney(total - feeStripeEstimado)}</span>
          </div>
        </div>

        <button className="vc-btn-primary mt-1" disabled={loading || !cliente} onClick={guardar}>
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>

        <button
          className="mt-1 rounded-pill border border-red py-2 text-sm font-medium text-red disabled:opacity-50"
          disabled={eliminando}
          onClick={eliminar}
        >
          {eliminando ? "Eliminando..." : confirmarEliminar ? "¿Seguro? Toca de nuevo para eliminar" : "Eliminar factura"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1">
      <label className="mb-1 block text-xs uppercase tracking-wide text-muted">{label}</label>
      {children}
    </div>
  );
}
