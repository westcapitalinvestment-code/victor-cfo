"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

type Entity = { id: string; name: string; ivu_applies: boolean; ivu_rate_estatal: number; ivu_rate_municipal: number };
type Client = { id: string; name: string; entity_id: string | null; ivu_exempt_reseller: boolean };
type ServicioCat = { id: string; nombre: string; descripcion: string | null; tipo: string; precio: number; ivu_exento: boolean };
type TecnicoOpcion = { id: string; name: string; entity_id: string | null };
// servicioId (1 sept 2026): referencia real al catálogo — ver el mismo
// campo en nueva-cotizacion-form.tsx para el porqué (agrupar de verdad en
// "Ingresos por servicio" en vez de por texto libre). detalle: descripción
// corta debajo del nombre, calcado de FreshBooks.
type Linea = { descripcion: string; detalle: string; cantidad: string; precioUnitario: string; servicioId: string | null };

type Cotizacion = {
  id: string;
  numero: string;
  entity_id: string | null;
  client_id: string | null;
  technician_id: string | null;
  fecha_vencimiento: string | null;
  notas: string | null;
  deposito_monto: number | null;
};

function sumaLinea(l: Linea): number {
  const cant = Number(l.cantidad) || 0;
  const precio = Number(l.precioUnitario) || 0;
  return cant * precio;
}

export default function EditarCotizacionForm({
  cotizacion,
  itemsIniciales,
  entities,
  clients,
  servicios,
  tecnicos,
  addonTecnicosActivo,
}: {
  cotizacion: Cotizacion;
  itemsIniciales: {
    id: string;
    descripcion: string;
    detalle: string | null;
    cantidad: number;
    precio_unitario: number;
    service_id: string | null;
  }[];
  entities: Entity[];
  clients: Client[];
  servicios: ServicioCat[];
  tecnicos: TecnicoOpcion[];
  addonTecnicosActivo: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [entityId, setEntityId] = useState(cotizacion.entity_id ?? entities[0]?.id ?? "");
  const entidad = entities.find((e) => e.id === entityId) ?? entities[0];

  const clientesDeEntidad = useMemo(
    () => clients.filter((c) => !c.entity_id || c.entity_id === entityId),
    [clients, entityId]
  );
  const [clientId, setClientId] = useState(cotizacion.client_id ?? clientesDeEntidad[0]?.id ?? "");
  const cliente = clientesDeEntidad.find((c) => c.id === clientId) ?? clientesDeEntidad[0];

  // "Asignar a técnico" — igual que en Nueva Cotización.
  const tecnicosDeEntidad = useMemo(
    () => tecnicos.filter((t) => !t.entity_id || t.entity_id === entityId),
    [tecnicos, entityId]
  );
  const [technicianId, setTechnicianId] = useState(cotizacion.technician_id ?? "");

  const [fechaVencimiento, setFechaVencimiento] = useState(cotizacion.fecha_vencimiento ?? "");
  const [notas, setNotas] = useState(cotizacion.notas ?? "");
  const [depositoInput, setDepositoInput] = useState(
    cotizacion.deposito_monto ? String(cotizacion.deposito_monto) : ""
  );
  const depositoMonto = Number(depositoInput) || 0;
  const [lineas, setLineas] = useState<Linea[]>(
    itemsIniciales.length > 0
      ? itemsIniciales.map((it) => ({
          descripcion: it.descripcion,
          detalle: it.detalle ?? "",
          cantidad: String(it.cantidad),
          precioUnitario: String(it.precio_unitario),
          servicioId: it.service_id,
        }))
      : [{ descripcion: "", detalle: "", cantidad: "1", precioUnitario: "", servicioId: null }]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function actualizarLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        // Igual que en nueva-cotizacion-form.tsx: editar la descripción a
        // mano desengancha la línea del catálogo.
        if (campo === "descripcion") return { ...l, descripcion: valor, servicioId: null };
        return { ...l, [campo]: valor };
      })
    );
  }
  function agregarLinea() {
    setLineas((prev) => [...prev, { descripcion: "", detalle: "", cantidad: "1", precioUnitario: "", servicioId: null }]);
  }
  function quitarLinea(i: number) {
    setLineas((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }
  // Estilo FreshBooks (1 sept 2026, pedido de Joel): el catálogo vive
  // dentro de cada línea — al elegir un servicio del buscador de ESA línea,
  // se llena esa línea específica (no se añade una línea nueva).
  function elegirServicioParaLinea(i: number, servicioId: string) {
    const s = servicios.find((x) => x.id === servicioId);
    if (!s) return;
    setLineas((prev) =>
      prev.map((l, idx) =>
        idx === i
          ? { descripcion: s.nombre, detalle: s.descripcion ?? "", cantidad: l.cantidad || "1", precioUnitario: String(s.precio), servicioId: s.id }
          : l
      )
    );
  }

  // Misma lógica que nueva-cotizacion-form.tsx (1 sept 2026, pedido de
  // Joel): el IVU se calcula por línea, respetando la exención del
  // servicio del catálogo, no sobre todo el subtotal de una vez.
  function lineaEsIvuExenta(l: Linea): boolean {
    if (!l.servicioId) return false;
    const s = servicios.find((x) => x.id === l.servicioId);
    return s ? s.ivu_exento : false;
  }

  const subtotal = lineas.reduce((sum, l) => sum + sumaLinea(l), 0);
  const subtotalGravable = lineas.reduce((sum, l) => sum + (lineaEsIvuExenta(l) ? 0 : sumaLinea(l)), 0);
  const ivuPct =
    entidad?.ivu_applies && !cliente?.ivu_exempt_reseller
      ? Number(entidad.ivu_rate_estatal || 0) + Number(entidad.ivu_rate_municipal || 0)
      : 0;
  const ivuMonto = subtotalGravable * (ivuPct / 100);
  const total = subtotal + ivuMonto;
  const balanceAlAprobar = total - depositoMonto;

  async function guardar() {
    if (!entidad || !cliente) return;
    const lineasValidas = lineas.filter((l) => l.descripcion.trim() && sumaLinea(l) > 0);
    if (lineasValidas.length === 0) {
      setError("Añade al menos una línea con descripción y precio.");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("cotizaciones")
      .update({
        entity_id: entidad.id,
        client_id: cliente.id,
        technician_id: technicianId || null,
        subtotal,
        ivu_pct: ivuPct,
        ivu_monto: ivuMonto,
        total,
        deposito_monto: depositoMonto,
        fecha_vencimiento: fechaVencimiento || null,
        notas: notas || null,
      })
      .eq("id", cotizacion.id);

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    // Más simple y confiable que tratar de reconciliar línea por línea:
    // borra las líneas viejas y mete las nuevas de una vez.
    const { error: deleteError } = await supabase.from("cotizacion_items").delete().eq("cotizacion_id", cotizacion.id);
    if (deleteError) {
      setLoading(false);
      setError(deleteError.message);
      return;
    }

    const { error: itemsError } = await supabase.from("cotizacion_items").insert(
      lineasValidas.map((l) => ({
        cotizacion_id: cotizacion.id,
        service_id: l.servicioId,
        descripcion: l.descripcion,
        detalle: l.detalle.trim() || null,
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

    router.push(`/dashboard/facturacion/cotizaciones/${cotizacion.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Editar cotización {cotizacion.numero}</h1>
        <button
          onClick={() => router.push(`/dashboard/facturacion/cotizaciones/${cotizacion.id}`)}
          className="text-sm text-muted hover:opacity-80"
        >
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
              </option>
            ))}
          </select>
        </Field>

        <Field label="Válida hasta">
          <input className="vc-input" type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
        </Field>

        {!addonTecnicosActivo ? (
          <div className="rounded-lg border border-teal/30 bg-teal/[.05] p-3 text-xs">
            <p className="font-medium text-teal">Add-on Equipo — $20.00/mes</p>
            <p className="mt-0.5 text-muted">
              Actívalo desde{" "}
              <Link href="/dashboard/equipo" className="underline">
                Equipo
              </Link>{" "}
              para poder asignar esta cotización a un técnico.
            </p>
          </div>
        ) : (
          tecnicosDeEntidad.length > 0 && (
            <Field label="Asignar a técnico (opcional)">
              <select className="vc-input" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
                <option value="">Sin asignar — la manejas tú</option>
                {tecnicosDeEntidad.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          )
        )}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Líneas</label>
          <div className="flex flex-col gap-3">
            {lineas.map((l, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <ServicioComboBox
                    servicios={servicios}
                    valor={l.descripcion}
                    onCambiarTexto={(v) => actualizarLinea(i, "descripcion", v)}
                    onElegirServicio={(servicioId) => elegirServicioParaLinea(i, servicioId)}
                    placeholder="Nombre del servicio"
                  />
                  <input
                    className="vc-input"
                    style={{ fontSize: 12 }}
                    placeholder="Descripción (opcional)"
                    value={l.detalle}
                    onChange={(e) => actualizarLinea(i, "detalle", e.target.value)}
                  />
                </div>
                {/* Ancho fijo en style, no en className: .vc-input trae
                    width:100% del CSS global que le gana a w-16/w-24 —
                    sin esto, estos inputs se salían de la tarjeta. */}
                <input
                  className="vc-input flex-shrink-0"
                  style={{ width: 64 }}
                  type="number"
                  min="0"
                  step="1"
                  value={l.cantidad}
                  onChange={(e) => actualizarLinea(i, "cantidad", e.target.value)}
                />
                <input
                  className="vc-input flex-shrink-0"
                  style={{ width: 96 }}
                  type="number"
                  min="0"
                  step="0.01"
                  value={l.precioUnitario}
                  onChange={(e) => actualizarLinea(i, "precioUnitario", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => quitarLinea(i)}
                  className="mt-1.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg"
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

        <Field label="Depósito requerido para comenzar (opcional)">
          <input
            className="vc-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={depositoInput}
            onChange={(e) => setDepositoInput(e.target.value)}
          />
        </Field>

        <Field label="Notas (opcional)">
          <textarea className="vc-input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Field>

        <div className="rounded-lg border border-border bg-bg p-3 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-muted">Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          {entidad?.ivu_applies && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted">IVU ({ivuPct}%)</span>
              <span>+{formatMoney(ivuMonto)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
            <span>Total</span>
            <span>{formatMoney(total)}</span>
          </div>
          {depositoMonto > 0 && (
            <>
              <div className="flex justify-between py-0.5">
                <span className="text-muted">Depósito requerido</span>
                <span>-{formatMoney(depositoMonto)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
                <span>Balance al aprobar</span>
                <span>{formatMoney(balanceAlAprobar)}</span>
              </div>
            </>
          )}
        </div>

        <button className="vc-btn-primary mt-1" disabled={loading || !cliente} onClick={guardar}>
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

// Buscador de servicios estilo FreshBooks (1 sept 2026, pedido de Joel —
// mismo componente que en Nueva/Editar Factura y Nueva Cotización): deja
// escribir texto libre — el valor del input ES la descripción de la línea,
// y el dropdown es un atajo para llenarla desde el catálogo.
function ServicioComboBox({
  servicios,
  valor,
  onCambiarTexto,
  onElegirServicio,
  placeholder,
}: {
  servicios: ServicioCat[];
  valor: string;
  onCambiarTexto: (v: string) => void;
  onElegirServicio: (servicioId: string) => void;
  placeholder: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  const filtrados = valor.trim() ? servicios.filter((s) => s.nombre.toLowerCase().includes(valor.trim().toLowerCase())) : servicios;

  return (
    <div className="relative" ref={ref}>
      <input
        className="vc-input"
        placeholder={placeholder}
        value={valor}
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          onCambiarTexto(e.target.value);
          setAbierto(true);
        }}
      />
      {abierto && filtrados.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {filtrados.map((s) => (
            <button
              key={s.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-bg"
              onClick={() => {
                onElegirServicio(s.id);
                setAbierto(false);
              }}
            >
              <span className="truncate">{s.nombre}</span>
              <span className="flex-shrink-0 text-xs text-muted">{formatMoney(s.precio)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
