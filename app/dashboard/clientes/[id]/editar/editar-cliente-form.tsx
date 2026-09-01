"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Entity = { id: string; name: string };
type Cliente = {
  id: string;
  entity_id: string | null;
  name: string;
  email: string | null;
  telefono: string | null;
  tax_id: string | null;
  address: string | null;
  es_negocio: boolean;
  retention_pct: number;
};

export default function EditarClienteForm({ cliente, entities, returnTo }: { cliente: Cliente; entities: Entity[]; returnTo?: string }) {
  const destino = returnTo || "/dashboard/clientes";
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entityId, setEntityId] = useState(cliente.entity_id ?? entities[0]?.id ?? "");
  const [name, setName] = useState(cliente.name);
  const [email, setEmail] = useState(cliente.email ?? "");
  const [telefono, setTelefono] = useState(cliente.telefono ?? "");
  const [taxId, setTaxId] = useState(cliente.tax_id ?? "");
  const [direccion, setDireccion] = useState(cliente.address ?? "");
  const [esNegocio, setEsNegocio] = useState(cliente.es_negocio);
  const [retentionPct, setRetentionPct] = useState(String(cliente.retention_pct || "10.00"));

  async function guardar() {
    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        entity_id: entityId,
        name,
        email: email || null,
        telefono: telefono || null,
        tax_id: taxId || null,
        address: direccion || null,
        es_negocio: esNegocio,
        retention_pct: esNegocio ? Number(retentionPct) : 0,
      })
      .eq("id", cliente.id);

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push(destino);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Editar cliente</h1>
        <button onClick={() => router.push(destino)} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        {entities.length > 1 && (
          <Field label="Entidad">
            <select className="vc-input" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  {ent.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Nombre del cliente">
          <input className="vc-input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Email (opcional)">
          <input className="vc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>

        <Field label="Teléfono (opcional — para enviar facturas por WhatsApp)">
          <input className="vc-input" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </Field>

        <Field label="RUC / Seguro Social patronal (opcional)">
          <input className="vc-input" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
        </Field>

        <Field label="Dirección (opcional — para su expediente)">
          <textarea className="vc-input" rows={2} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </Field>

        <div className="flex items-center justify-between rounded-lg border border-border bg-bg p-3">
          <div>
            <p className="text-sm font-medium">¿Es un negocio?</p>
            <p className="text-xs text-muted">Aplica retención automática al facturar</p>
          </div>
          <button
            type="button"
            onClick={() => setEsNegocio(!esNegocio)}
            className="relative h-[17px] w-[30px] flex-shrink-0 rounded-full transition-colors"
            style={{ background: esNegocio ? "#1D9E75" : "var(--border)" }}
          >
            <span
              className="absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white transition-all"
              style={{ left: esNegocio ? "15px" : "2px" }}
            />
          </button>
        </div>

        {esNegocio && (
          <Field label="% de retención (10% estándar — baja a 6% o 0% con Certificado de Relevo)">
            <input
              className="vc-input"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={retentionPct}
              onChange={(e) => setRetentionPct(e.target.value)}
            />
          </Field>
        )}

        <button className="vc-btn-primary mt-1" disabled={!name || loading} onClick={guardar}>
          {loading ? "Guardando..." : "Guardar cambios"}
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
