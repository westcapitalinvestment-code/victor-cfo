"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Feature 1 del brief técnico (Retención B2B 10%/6%, Prioridad ALTA):
// "Al crear un cliente, toggle simple: '¿Es un negocio? (Aplica Retención
// 10%)'. Si tiene Certificado de Relevo, campo para ingresar el porcentaje
// (ej. 6% o 0%)". Eso es exactamente lo que hace este formulario.

type Entity = { id: string; name: string };

export default function NuevoClienteForm({
  entities,
  returnTo,
  ownerIdEfectivo,
}: {
  entities: Entity[];
  returnTo?: string;
  // Portal de Admin/Secretaria (2 sept 2026) — ver comentario largo en
  // facturacion-portal.tsx. Sin esto, un admin creando un cliente lo
  // guardaría bajo su PROPIO user.id en vez del owner_id del dueño.
  ownerIdEfectivo?: string;
}) {
  const destino = returnTo || "/dashboard/clientes";
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email2, setEmail2] = useState("");
  const [telefono2, setTelefono2] = useState("");
  const [taxId, setTaxId] = useState("");
  const [direccion, setDireccion] = useState("");
  const [esNegocio, setEsNegocio] = useState(false);
  const [retentionPct, setRetentionPct] = useState("10.00");

  async function crearCliente() {
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

    const { error: insertError } = await supabase.from("clients").insert({
      owner_id: ownerIdEfectivo ?? user.id,
      entity_id: entityId,
      name,
      email: email || null,
      telefono: telefono || null,
      email_2: email2 || null,
      telefono_2: telefono2 || null,
      tax_id: taxId || null,
      address: direccion || null,
      es_negocio: esNegocio,
      retention_pct: esNegocio ? Number(retentionPct) : 0,
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push(destino);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Nuevo cliente</h1>
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

        {/* 2do contacto (1 sept 2026, pedido de Joel): en FreshBooks, para
            mandarle la factura a 2 correos había que duplicar el cliente
            entero — con esto un solo cliente guarda ambos contactos. Por
            ahora es solo de referencia (copiar/pegar al enviar). */}
        <Field label="Email secundario (opcional)">
          <input className="vc-input" type="email" value={email2} onChange={(e) => setEmail2(e.target.value)} />
        </Field>

        <Field label="Teléfono secundario (opcional)">
          <input className="vc-input" type="tel" value={telefono2} onChange={(e) => setTelefono2(e.target.value)} />
        </Field>

        <Field label="RUC / Seguro Social patronal (opcional)">
          <input className="vc-input" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
        </Field>

        <Field label="Dirección (opcional — para su expediente)">
          <textarea className="vc-input" rows={2} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </Field>

        {/* El toggle central de Feature 1 */}
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

        <button className="vc-btn-primary mt-1" disabled={!name || loading} onClick={crearCliente}>
          {loading ? "Guardando..." : "Guardar cliente"}
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
