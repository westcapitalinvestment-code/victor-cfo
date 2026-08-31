"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

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
};

type Linea = { descripcion: string; cantidad: string; precioUnitario: string };

// Convierte "Net 30" / "Net 15" / "Net 0" en días — cualquier otro texto
// (ej. "Al recibir", "Sin recargo") cae en el default de 30 días, que es
// el término más común y nunca deja el campo vacío.
function diasDeTermino(term: string): number {
  const m = term.match(/(\d+)/);
  return m ? Number(m[1]) : 30;
}

function sumaLinea(l: Linea): number {
  const cant = Number(l.cantidad) || 0;
  const precio = Number(l.precioUnitario) || 0;
  return cant * precio;
}

export default function NuevaFacturaForm({
  entities,
  clients,
  conteosPorEntidad,
}: {
  entities: Entity[];
  clients: Client[];
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

  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaVencimiento, setFechaVencimiento] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + diasDeTermino(entidad?.default_payment_terms ?? "Net 30"));
    return d.toISOString().slice(0, 10);
  });
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([{ descripcion: "", cantidad: "1", precioUnitario: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function actualizarLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }
  function agregarLinea() {
    setLineas((prev) => [...prev, { descripcion: "", cantidad: "1", precioUnitario: "" }]);
  }
  function quitarLinea(i: number) {
    setLineas((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  const subtotal = lineas.reduce((sum, l) => sum + sumaLinea(l), 0);
  // IVU: solo si la entidad lo tiene activo, y nunca si el cliente trae
  // certificado de exención de revendedor validado (ver 0001/comentario
  // en la tabla clients — "feedback CPA vía Gemini").
  const ivuPct =
    entidad?.ivu_applies && !cliente?.ivu_exempt_reseller
      ? Number(entidad.ivu_rate_estatal || 0) + Number(entidad.ivu_rate_municipal || 0)
      : 0;
  const ivuMonto = subtotal * (ivuPct / 100);
  // Retención: la que el cliente (como pagador) aplica al pagarle al
  // negocio — viene de clients.retention_pct, solo si es_negocio. Se
  // calcula sobre el subtotal de servicios, no sobre el IVU (práctica
  // estándar en PR).
  const retencionPct = cliente?.es_negocio ? Number(cliente.retention_pct || 0) : 0;
  const retencionMonto = subtotal * (retencionPct / 100);
  const total = subtotal + ivuMonto - retencionMonto;

  const numeroPreview = entidad ? `${entidad.invoice_prefix}-${entidad.invoice_start_number + (conteosPorEntidad[entidad.id] ?? 0)}` : "";

  async function guardar() {
    if (!entidad || !cliente) return;
    const lineasValidas = lineas.filter((l) => l.descripcion.trim() && sumaLinea(l) > 0);
    if (lineasValidas.length === 0) {
      setError("Añade al menos una línea con descripción y precio.");
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
        numero: numeroPreview,
        subtotal,
        ivu_pct: ivuPct,
        ivu_monto: ivuMonto,
        retencion_pct: retencionPct,
        retencion_monto: retencionMonto,
        total,
        estado: "borrador",
        fecha_emision: hoy,
        fecha_vencimiento: fechaVencimiento,
        notas: notas || null,
      })
      .select("id")
      .maybeSingle();

    if (insertError || !factura) {
      setError(insertError?.message || "No se pudo crear la factura.");
      setLoading(false);
      return;
    }

    const { error: itemsError } = await supabase.from("invoice_items").insert(
      lineasValidas.map((l) => ({
        invoice_id: factura.id,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad) || 1,
        precio_unitario: Number(l.precioUnitario) || 0,
        subtotal_linea: sumaLinea(l),
      }))
    );

    setLoading(false);

    if (itemsError) {
      setError(itemsError.message);
      return;
    }

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

        <p className="text-xs text-muted">Número de factura: <span className="font-medium text-text">{numeroPreview}</span></p>

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
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Fecha de vencimiento">
          <input
            className="vc-input"
            type="date"
            value={fechaVencimiento}
            onChange={(e) => setFechaVencimiento(e.target.value)}
          />
        </Field>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Líneas</label>
          <div className="flex flex-col gap-2">
            {lineas.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="vc-input flex-1"
                  placeholder="Descripción del servicio"
                  value={l.descripcion}
                  onChange={(e) => actualizarLinea(i, "descripcion", e.target.value)}
                />
                <input
                  className="vc-input w-16"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Cant."
                  value={l.cantidad}
                  onChange={(e) => actualizarLinea(i, "cantidad", e.target.value)}
                />
                <input
                  className="vc-input w-24"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Precio"
                  value={l.precioUnitario}
                  onChange={(e) => actualizarLinea(i, "precioUnitario", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => quitarLinea(i)}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg"
                  title="Quitar línea"
                >
                  <i className="ti ti-trash" style={{ fontSize: 14 }} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={agregarLinea} className="mt-2 text-xs font-medium text-teal hover:opacity-80">
            + Añadir línea
          </button>
        </div>

        <Field label="Notas (opcional)">
          <textarea
            className="vc-input"
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Términos, instrucciones de pago, etc."
          />
        </Field>

        <div className="rounded-lg border border-border bg-bg p-3 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-muted">Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          {ivuPct > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted">IVU ({ivuPct}%)</span>
              <span>+{formatMoney(ivuMonto)}</span>
            </div>
          )}
          {retencionPct > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted">Retención ({retencionPct}%)</span>
              <span>-{formatMoney(retencionMonto)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
            <span>Total</span>
            <span>{formatMoney(total)}</span>
          </div>
        </div>

        <button className="vc-btn-primary mt-1" disabled={loading || !cliente} onClick={guardar}>
          {loading ? "Guardando..." : "Guardar factura"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-muted">{label}</label>
      {children}
    </div>
  );
}
