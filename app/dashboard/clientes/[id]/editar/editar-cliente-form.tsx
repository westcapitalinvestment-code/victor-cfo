"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Entity = { id: string; name: string };
type Cliente = {
  id: string;
  entity_id: string | null;
  name: string;
  email: string | null;
  telefono: string | null;
  email_2: string | null;
  telefono_2: string | null;
  tax_id: string | null;
  address: string | null;
  es_negocio: boolean;
  retention_pct: number;
  active: boolean;
};
type OtroCliente = { id: string; name: string; active: boolean };

export default function EditarClienteForm({
  cliente,
  entities,
  returnTo,
  puedeEliminar,
  otrosClientes,
}: {
  cliente: Cliente;
  entities: Entity[];
  returnTo?: string;
  puedeEliminar: boolean;
  otrosClientes: OtroCliente[];
}) {
  const destino = returnTo || "/dashboard/clientes";
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activo, setActivo] = useState(cliente.active);

  const [entityId, setEntityId] = useState(cliente.entity_id ?? entities[0]?.id ?? "");
  const [name, setName] = useState(cliente.name);
  const [email, setEmail] = useState(cliente.email ?? "");
  const [telefono, setTelefono] = useState(cliente.telefono ?? "");
  const [email2, setEmail2] = useState(cliente.email_2 ?? "");
  const [telefono2, setTelefono2] = useState(cliente.telefono_2 ?? "");
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
        email_2: email2 || null,
        telefono_2: telefono2 || null,
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

  // Archivar nunca borra nada — solo esconde al cliente de la lista activa
  // y de los selectores de "Nueva factura"/"Nueva cotización" (ver 0043).
  // 100% reversible con "Reactivar".
  async function alternarActivo() {
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase.from("clients").update({ active: !activo }).eq("id", cliente.id);
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setActivo(!activo);
  }

  // Eliminar de verdad — solo se llega aquí si puedeEliminar es true (el
  // servidor ya confirmó que no tiene facturas ni cotizaciones), pero se
  // pide confirmación igual porque es irreversible.
  async function eliminar() {
    if (!confirm(`¿Eliminar a "${cliente.name}" por completo? Esto no se puede deshacer.`)) return;
    setLoading(true);
    setError(null);
    const { error: deleteError } = await supabase.from("clients").delete().eq("id", cliente.id);
    setLoading(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.push(destino);
    router.refresh();
  }

  // Fusionar duplicados (1 sept 2026, pedido de Joel: en FreshBooks, para
  // mandar la factura a 2 correos había que crear el cliente dos veces —
  // así que ahora tiene clientes duplicados con facturas viejas repartidas
  // entre ambas filas). Esto NO borra historial: mueve todas las facturas y
  // cotizaciones de ESTE cliente hacia el que el usuario escoja como "el
  // bueno", y solo entonces borra este. Si este cliente tiene un email/tel.
  // que el otro no tiene, hay que copiarlo a mano antes de fusionar —
  // fusionar no combina esos campos, solo el historial de facturación.
  const [clienteDestinoId, setClienteDestinoId] = useState("");
  const [fusionando, setFusionando] = useState(false);
  const clienteDestino = otrosClientes.find((c) => c.id === clienteDestinoId);

  async function fusionar() {
    if (!clienteDestino) return;
    if (
      !confirm(
        `¿Mover todas las facturas y cotizaciones de "${cliente.name}" a "${clienteDestino.name}", y borrar "${cliente.name}"? ` +
          `Esto no se puede deshacer — si "${cliente.name}" tiene un email o teléfono que "${clienteDestino.name}" no tiene, cópialo antes.`
      )
    ) {
      return;
    }
    setFusionando(true);
    setError(null);

    const { error: errorFacturas } = await supabase
      .from("invoices")
      .update({ client_id: clienteDestino.id })
      .eq("client_id", cliente.id);
    if (errorFacturas) {
      setFusionando(false);
      setError(`No se pudieron mover las facturas: ${errorFacturas.message}`);
      return;
    }

    const { error: errorCotizaciones } = await supabase
      .from("cotizaciones")
      .update({ client_id: clienteDestino.id })
      .eq("client_id", cliente.id);
    if (errorCotizaciones) {
      setFusionando(false);
      setError(`No se pudieron mover las cotizaciones: ${errorCotizaciones.message}`);
      return;
    }

    const { error: errorBorrar } = await supabase.from("clients").delete().eq("id", cliente.id);
    setFusionando(false);
    if (errorBorrar) {
      setError(`Las facturas ya se movieron, pero no se pudo borrar "${cliente.name}": ${errorBorrar.message}`);
      return;
    }

    router.push(`/dashboard/clientes/${clienteDestino.id}/editar`);
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

        {/* 2do contacto (1 sept 2026, pedido de Joel): antes había que
            duplicar el cliente entero para guardar un segundo email/tel. */}
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

        <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
          <div>
            <p className="text-sm font-medium">{activo ? "Cliente activo" : "Cliente archivado"}</p>
            <p className="text-xs text-muted">
              {activo
                ? "Archivarlo lo esconde de la lista y de \"Nueva factura\" — su historial no se toca."
                : "No aparece en la lista ni en \"Nueva factura\". Reactívalo cuando vuelva a ser cliente."}
            </p>
          </div>
          <button type="button" className="flex-shrink-0 text-xs font-medium text-muted underline hover:text-teal" disabled={loading} onClick={alternarActivo}>
            {activo ? "Archivar" : "Reactivar"}
          </button>
        </div>

        {puedeEliminar && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Este cliente no tiene facturas ni cotizaciones — se puede eliminar por completo.</p>
            <button type="button" className="flex-shrink-0 text-xs font-medium text-red underline hover:opacity-80" disabled={loading} onClick={eliminar}>
              Eliminar
            </button>
          </div>
        )}

        {otrosClientes.length > 0 && (
          <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
            <div>
              <p className="text-sm font-medium">¿Este cliente es un duplicado?</p>
              <p className="text-xs text-muted">
                Mueve todas sus facturas y cotizaciones al cliente correcto, y borra esta fila — no se pierde
                historial. Si aquí hay un email/teléfono que el otro cliente no tiene, cópialo primero a mano.
              </p>
            </div>
            <SelectorClienteDestino
              items={otrosClientes}
              valorId={clienteDestinoId}
              onSeleccionar={setClienteDestinoId}
              placeholder="Buscar el cliente correcto..."
            />
            <button
              type="button"
              className="self-start text-xs font-medium text-red underline hover:opacity-80 disabled:opacity-50"
              disabled={!clienteDestino || fusionando}
              onClick={fusionar}
            >
              {fusionando ? "Fusionando..." : `Fusionar con "${clienteDestino?.name ?? "..."}" y borrar este`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Buscador simple para elegir el cliente "correcto" al fusionar — mismo
// patrón que SelectorBuscable en nueva-factura-form.tsx (input de texto que
// muestra/filtra la lista completa al enfocar).
function SelectorClienteDestino({
  items,
  valorId,
  onSeleccionar,
  placeholder,
}: {
  items: OtroCliente[];
  valorId: string;
  onSeleccionar: (id: string) => void;
  placeholder: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const seleccionado = items.find((i) => i.id === valorId);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
        setBusqueda("");
      }
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  const filtrados = busqueda.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : items;

  return (
    <div className="relative" ref={ref}>
      <input
        className="vc-input"
        placeholder={placeholder}
        value={abierto ? busqueda : seleccionado ? seleccionado.name : ""}
        onFocus={() => {
          setAbierto(true);
          setBusqueda("");
        }}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      {abierto && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {filtrados.length === 0 && <p className="p-3 text-xs text-muted">Sin resultados.</p>}
          {filtrados.map((item) => (
            <button
              key={item.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-bg"
              onClick={() => {
                onSeleccionar(item.id);
                setAbierto(false);
                setBusqueda("");
              }}
            >
              {item.name}
              {!item.active && <span className="ml-1 text-xs text-muted">(archivado)</span>}
            </button>
          ))}
        </div>
      )}
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
