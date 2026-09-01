"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

type ArchivoPendiente = { localId: string; file: File };

type Entity = {
  id: string;
  name: string;
  ivu_applies: boolean;
  ivu_rate_estatal: number;
  ivu_rate_municipal: number;
  invoice_prefix: string;
  invoice_start_number: number;
  default_payment_terms: string;
};

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

const METODOS_COBRO = ["ATH Móvil", "Transferencia / ACH", "Cheque", "Efectivo"];

// Fee real de Stripe en PR: 2.9% + $0.30 por transacción de tarjeta. Es
// solo un estimado informativo — no procesamos el cobro todavía, es para
// que Joel (o cualquier dueño) sepa qué le quedaría neto si decide cobrar
// con un link de pago de Stripe por su cuenta.
const STRIPE_FEE_PCT = 0.029;
const STRIPE_FEE_FIJO = 0.3;

function diasDeTermino(term: string): number {
  const m = term.match(/(\d+)/);
  return m ? Number(m[1]) : 30;
}

// Misma lógica que /api/cron/facturas-recurrentes — calcula cuándo debe
// generarse el próximo ciclo de una factura recurrente a partir de HOY,
// para dejarlo listo desde que se crea la plantilla.
function avanzarFecha(fechaISO: string, frecuencia: string): string {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  if (frecuencia === "semanal") d.setUTCDate(d.getUTCDate() + 7);
  else if (frecuencia === "quincenal") d.setUTCDate(d.getUTCDate() + 15);
  else d.setUTCMonth(d.getUTCMonth() + 1); // mensual (default)
  return d.toISOString().slice(0, 10);
}

export default function NuevaFacturaForm({
  entities,
  clients,
  servicios,
  conteosPorEntidad,
}: {
  entities: Entity[];
  clients: Client[];
  servicios: ServicioCat[];
  conteosPorEntidad: Record<string, number>;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const entidad = entities.find((e) => e.id === entityId) ?? entities[0];

  const clientesDeEntidad = useMemo(
    () => clients.filter((c) => !c.entity_id || c.entity_id === entityId),
    [clients, entityId]
  );
  const [clientId, setClientId] = useState(clientesDeEntidad[0]?.id ?? "");
  const cliente = clientesDeEntidad.find((c) => c.id === clientId) ?? clientesDeEntidad[0];

  const [servicioId, setServicioId] = useState<string>(servicios[0]?.id ?? "personalizado");
  const servicio = servicios.find((s) => s.id === servicioId);
  const [descripcionPersonalizada, setDescripcionPersonalizada] = useState("");
  const [monto, setMonto] = useState(servicios[0] ? String(servicios[0].precio) : "");

  function elegirServicio(id: string) {
    setServicioId(id);
    const s = servicios.find((x) => x.id === id);
    if (s) setMonto(String(s.precio));
  }

  const [metodosCobro, setMetodosCobro] = useState<string[]>(["ATH Móvil", "Transferencia / ACH"]);
  function toggleMetodo(m: string) {
    setMetodosCobro((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  const [moraTipo, setMoraTipo] = useState<"ninguno" | "fijo" | "porcentaje">("ninguno");
  const [moraMonto, setMoraMonto] = useState("");
  const [moraDias, setMoraDias] = useState("10");

  const [recurrencia, setRecurrencia] = useState<"unica" | "semanal" | "quincenal" | "mensual">("unica");

  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaFactura, setFechaFactura] = useState(hoy);
  const [fechaVencimiento, setFechaVencimiento] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + diasDeTermino(entidad?.default_payment_terms ?? "Net 30"));
    return d.toISOString().slice(0, 10);
  });
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCamaraRef = useRef<HTMLInputElement>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const [archivosPendientes, setArchivosPendientes] = useState<ArchivoPendiente[]>([]);

  function agregarArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setArchivosPendientes((prev) => [...prev, ...files.map((file) => ({ localId: `${Date.now()}-${Math.random()}`, file }))]);
  }
  function quitarArchivo(localId: string) {
    setArchivosPendientes((prev) => prev.filter((a) => a.localId !== localId));
  }

  const descripcionFinal = servicioId === "personalizado" ? descripcionPersonalizada : servicio?.nombre ?? "";
  const montoNum = Number(monto) || 0;

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

  // Cobro en línea real (que el cliente pague con tarjeta directo en la
  // app) todavía no está activo — este fee es solo un estimado informativo.
  const feeStripeEstimado = (subtotal + ivuMonto) * STRIPE_FEE_PCT + STRIPE_FEE_FIJO;
  const recibirasConTarjeta = total - feeStripeEstimado;

  const numeroPreview = entidad ? `${entidad.invoice_prefix}-${entidad.invoice_start_number + (conteosPorEntidad[entidad.id] ?? 0)}` : "";

  async function guardar(estadoInicial: "borrador" | "enviada") {
    if (!entidad || !cliente) return;
    if (!descripcionFinal.trim() || montoNum <= 0) {
      setError("Elige un servicio (o describe uno personalizado) y pon un monto mayor a $0.");
      return;
    }

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

    const { data: factura, error: insertError } = await supabase
      .from("invoices")
      .insert({
        owner_id: user.id,
        entity_id: entidad.id,
        client_id: cliente.id,
        servicio_id: servicioId !== "personalizado" ? servicioId : null,
        numero: numeroPreview,
        subtotal,
        ivu_pct: ivuPct,
        ivu_monto: ivuMonto,
        retencion_pct: retencionPct,
        retencion_monto: retencionMonto,
        total,
        estado: estadoInicial,
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
      .select("id")
      .maybeSingle();

    if (insertError || !factura) {
      setError(insertError?.message || "No se pudo crear la factura.");
      setLoading(false);
      return;
    }

    const { error: itemsError } = await supabase.from("invoice_items").insert({
      invoice_id: factura.id,
      descripcion: descripcionFinal,
      cantidad: 1,
      precio_unitario: montoNum,
      subtotal_linea: montoNum,
    });

    if (itemsError) {
      setLoading(false);
      setError(itemsError.message);
      return;
    }

    // La evidencia se sube DESPUÉS de crear la factura, igual que en
    // Documentos — si algún archivo falla, la factura igual queda
    // guardada (con los que sí subieron); se puede agregar el resto luego
    // desde Editar.
    for (const archivo of archivosPendientes) {
      const formData = new FormData();
      formData.append("file", archivo.file);
      formData.append("invoiceId", factura.id);
      const res = await fetch("/api/facturas/adjuntos/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoading(false);
        setError(data.error ?? "La factura se guardó, pero algún archivo no se pudo subir. Puedes intentar de nuevo desde Editar.");
        router.push(`/dashboard/facturacion/${factura.id}`);
        router.refresh();
        return;
      }
    }

    setLoading(false);
    router.push(`/dashboard/facturacion/${factura.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Nueva factura</h1>
        <button onClick={() => router.push("/dashboard/facturacion")} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <p className="text-xs text-muted">
          Número de factura: <span className="font-medium text-text">{numeroPreview}</span>
        </p>

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
          {clientesDeEntidad.length === 0 ? (
            <p className="text-xs text-amb">Esta entidad no tiene clientes todavía.</p>
          ) : (
            <select className="vc-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clientesDeEntidad.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.es_negocio && Number(c.retention_pct) > 0 ? ` (Créd. Hacienda ${Number(c.retention_pct)}%)` : ""}
                </option>
              ))}
            </select>
          )}
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

        <Field label="Monto">
          <input
            className="vc-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
        </Field>

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
            <button
              type="button"
              disabled
              title="Próximamente — todavía no procesamos cobros en línea"
              className="rounded-lg border px-2.5 py-1.5 text-xs font-medium opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Stripe (tarjeta) — próximamente
            </button>
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
                  placeholder={moraTipo === "porcentaje" ? "%" : "$"}
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
          {moraTipo !== "ninguno" && (
            <p className="mt-1 text-xs text-muted">
              El recargo se muestra en la factura como referencia — todavía no se suma solo al total si se vence.
            </p>
          )}
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
          {recurrencia !== "unica" && (
            <p className="mt-1 text-xs text-muted">
              Cuando envíes esta factura, VICTOR va a crear la siguiente automáticamente (como borrador, para que la
              revises) cuando llegue el próximo ciclo.
            </p>
          )}
        </Field>

        <Field label="Notas para el cliente (opcional)">
          <textarea
            className="vc-input"
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej: Servicios julio 2026 — período 1-31 jul"
          />
        </Field>

        <Field label="Evidencia del trabajo (opcional)">
          <input ref={inputCamaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={agregarArchivos} />
          <input ref={inputArchivoRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={agregarArchivos} />
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-pill border border-border py-2 text-sm font-medium hover:opacity-80"
              onClick={() => inputCamaraRef.current?.click()}
            >
              📷 Foto
            </button>
            <button
              type="button"
              className="flex-1 rounded-pill border border-border py-2 text-sm font-medium hover:opacity-80"
              onClick={() => inputArchivoRef.current?.click()}
            >
              📁 Añadir archivo(s)
            </button>
          </div>
          {archivosPendientes.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {archivosPendientes.map((a) => (
                <li key={a.localId} className="flex items-center justify-between rounded-lg border border-border p-2 text-xs">
                  <span className="truncate">{a.file.name}</span>
                  <button type="button" className="flex-shrink-0 font-medium text-red underline" onClick={() => quitarArchivo(a.localId)}>
                    quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
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
          {retencionMonto > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              Los {formatMoney(retencionMonto)} de retención los deposita el cliente a Hacienda PR según la Sección 1062.03.
            </p>
          )}
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
            <span>{formatMoney(recibirasConTarjeta)}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">Estimado — todavía no procesamos cobros con tarjeta directamente en la app.</p>
        </div>

        <button className="vc-btn-primary mt-1" disabled={loading || !cliente} onClick={() => guardar("enviada")}>
          {loading ? "Guardando..." : "Enviar factura"}
        </button>
        <button
          className="vc-btn-secondary"
          disabled={loading || !cliente}
          onClick={() => guardar("borrador")}
        >
          {loading ? "Guardando..." : "Guardar como borrador"}
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
