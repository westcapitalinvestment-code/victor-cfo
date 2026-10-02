"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Entidad = { id: string; name: string; invoice_prefix: string; invoice_start_number: number };
type Cliente = { id: string; name: string; entity_id: string | null };

// Cobro Rápido (28 sept 2026) — versión mínima de crear factura, hecha a
// propósito para cobrar EN PERSONA sin la fricción de Nueva Factura
// (líneas, IVU/Sales Tax, retención, términos, etc.). Un solo monto, un
// cliente opcional, y directo al QR — la idea es que el dueño pueda cobrarle
// a alguien en menos de 10 segundos mientras el cliente espera al lado.
// Deliberadamente NO calcula tax/retención — si el negocio necesita eso,
// usa Nueva Factura normal. El invoice queda igual de real (mismo estado
// "enviada", mismo flujo de pago) — solo el formulario es más corto.
export default function CobroRapidoForm({
  entities,
  clients,
  conteosPorEntidad,
  entidadPreseleccionada,
}: {
  entities: Entidad[];
  clients: Cliente[];
  conteosPorEntidad: Record<string, number>;
  // 2 oct 2026, fix bug de mezcla de entidades: entidad activa del selector
  // "Negocio" del topbar (ver lib/entidad-activa.ts).
  entidadPreseleccionada?: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [entidadId, setEntidadId] = useState(entidadPreseleccionada ?? entities[0]?.id ?? "");
  const [monto, setMonto] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [descripcion, setDescripcion] = useState("Cobro rápido");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entidad = entities.find((e) => e.id === entidadId);
  const numeroPreview = entidad ? `${entidad.invoice_prefix}-${entidad.invoice_start_number + (conteosPorEntidad[entidad.id] ?? 0)}` : "";
  const clientesDeEntidad = clients.filter((c) => !c.entity_id || c.entity_id === entidadId);
  const montoNum = Number(monto) || 0;

  async function crear() {
    if (!entidad) {
      setError("Falta la entidad de negocio.");
      return;
    }
    if (montoNum <= 0) {
      setError("Escribe un monto mayor a $0.");
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

    const hoy = new Date().toISOString().slice(0, 10);

    const { data: factura, error: insertError } = await supabase
      .from("invoices")
      .insert({
        owner_id: user.id,
        entity_id: entidad.id,
        client_id: clienteId || null,
        numero: numeroPreview,
        subtotal: montoNum,
        ivu_pct: 0,
        ivu_monto: 0,
        retencion_pct: 0,
        retencion_monto: 0,
        total: montoNum,
        deposito_monto: 0,
        estado: "enviada",
        fecha_emision: hoy,
        fecha_vencimiento: hoy,
        notas: "Creada desde Cobro Rápido.",
      })
      .select("id")
      .maybeSingle();

    if (insertError || !factura) {
      setError(insertError?.message || "No se pudo crear el cobro.");
      setLoading(false);
      return;
    }

    const { error: itemError } = await supabase.from("invoice_items").insert({
      invoice_id: factura.id,
      service_id: null,
      descripcion: descripcion.trim() || "Cobro rápido",
      detalle: null,
      cantidad: 1,
      precio_unitario: montoNum,
      subtotal_linea: montoNum,
    });

    if (itemError) {
      setLoading(false);
      setError(itemError.message);
      return;
    }

    router.push(`/dashboard/facturacion/${factura.id}?qr=1`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">⚡ Cobro Rápido</h1>
        <button onClick={() => router.push("/dashboard/facturacion")} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <p className="mb-5 text-xs text-muted">
        Para cobrar en persona ahora mismo — sin líneas ni impuestos. Escribe el monto, escoge el cliente si lo
        tienes a mano (o déjalo en blanco), y sales directo al QR para que paguen por tarjeta o ATH Móvil.
      </p>

      <div className="vc-card flex flex-col gap-4">
        {entities.length > 1 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Entidad</label>
            <select className="vc-input" value={entidadId} onChange={(e) => setEntidadId(e.target.value)}>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Monto</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted">$</span>
            <input
              className="vc-input text-2xl font-semibold"
              style={{ paddingLeft: 28 }}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Descripción (opcional)</label>
          <input
            className="vc-input"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Cobro rápido"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Cliente (opcional)</label>
          <select className="vc-input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Sin cliente (cobro al contado)</option>
            {clientesDeEntidad.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-muted">
          Número: <span className="font-medium text-text">{numeroPreview}</span>
        </p>

        {error && <p className="text-xs text-red">{error}</p>}

        <button className="vc-btn-primary" onClick={crear} disabled={loading || montoNum <= 0}>
          {loading ? "Creando..." : "Generar QR de cobro"}
        </button>
      </div>
    </div>
  );
}
