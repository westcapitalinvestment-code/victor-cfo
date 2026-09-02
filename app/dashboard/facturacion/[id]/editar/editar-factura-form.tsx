"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

type Entity = {
  id: string;
  name: string;
  ivu_applies: boolean;
  ivu_rate_estatal: number;
  ivu_rate_municipal: number;
  client_retention_situation: string | null;
  ath_movil_business_path: string | null;
};

// Misma lógica que en nueva-factura-form.tsx.
function defaultRetencion(entidad: Entity | undefined): { activa: boolean; pct: string } {
  const situacion = entidad?.client_retention_situation;
  if (situacion === "10") return { activa: true, pct: "10.00" };
  if (situacion === "6") return { activa: true, pct: "6.00" };
  return { activa: false, pct: "10.00" };
}
type Client = {
  id: string;
  name: string;
  entity_id: string | null;
  es_negocio: boolean;
  retention_pct: number;
  ivu_exempt_reseller: boolean;
  telefono: string | null;
};
type ServicioCat = { id: string; nombre: string; descripcion: string | null; tipo: string; precio: number; ivu_exento: boolean };

type TecnicoOpcion = { id: string; name: string; entity_id: string | null };

// Varias líneas por factura (1 sept 2026) — mismo modelo que
// nueva-factura-form.tsx y que Cotización. detalle: descripción corta
// debajo del nombre, calcado de FreshBooks (Invoice 0001540.pdf).
type Linea = { descripcion: string; detalle: string; cantidad: string; precioUnitario: string; servicioId: string | null };

function sumaLinea(l: Linea): number {
  const cant = Number(l.cantidad) || 0;
  const precio = Number(l.precioUnitario) || 0;
  return cant * precio;
}

type Factura = {
  id: string;
  entity_id: string | null;
  client_id: string | null;
  technician_id: string | null;
  numero: string;
  estado: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  notas: string | null;
  metodos_cobro_aceptados: string[] | null;
  retencion_pct: number;
  late_fee_habilitado: boolean;
  late_fee_tipo: string | null;
  late_fee_monto: number;
  late_fee_dias_gracia: number;
  es_recurrente: boolean;
  frecuencia_recurrente: string | null;
  deposito_monto: number | null;
};

const METODOS_COBRO = ["ATH Móvil", "Transferencia / ACH", "Cheque", "Efectivo"];
const STRIPE_FEE_PCT = 0.029;
const STRIPE_FEE_FIJO = 0.3;

// ATH Móvil Business: 2.25% por pago recibido, mínimo $0.06 — mismo dato
// que en nueva-factura-form.tsx (confirmado en ath.business/preguntas).
const ATH_FEE_PCT = 0.0225;
const ATH_FEE_MINIMO = 0.06;

export default function EditarFacturaForm({
  factura,
  itemsIniciales,
  entities,
  clients,
  servicios,
  tecnicos,
  addonTecnicosActivo,
}: {
  factura: Factura;
  itemsIniciales: {
    id: string;
    descripcion: string;
    detalle: string | null;
    precio_unitario: number;
    cantidad: number;
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

  const [entityId, setEntityId] = useState(factura.entity_id ?? entities[0]?.id ?? "");
  const entidad = entities.find((e) => e.id === entityId) ?? entities[0];

  const clientesDeEntidad = useMemo(
    () => clients.filter((c) => !c.entity_id || c.entity_id === entityId),
    [clients, entityId]
  );
  const [clientId, setClientId] = useState(factura.client_id ?? clientesDeEntidad[0]?.id ?? "");
  const cliente = clientesDeEntidad.find((c) => c.id === clientId) ?? clientesDeEntidad[0];

  // "Asignar a técnico" (Equipo, 2 sept 2026) — igual que en Nueva Factura.
  const tecnicosDeEntidad = useMemo(
    () => tecnicos.filter((t) => !t.entity_id || t.entity_id === entityId),
    [tecnicos, entityId]
  );
  const [technicianId, setTechnicianId] = useState(factura.technician_id ?? "");

  // Toggle "Cliente te retiene" (1 sept 2026) — arranca con lo que ya tenía
  // guardado ESTA factura (no lo que el cliente tenga hoy, que pudo haber
  // cambiado desde que se creó); solo se recalcula desde el cliente/entidad
  // si el usuario cambia el cliente en el dropdown.
  const [retencionActiva, setRetencionActiva] = useState(Number(factura.retencion_pct || 0) > 0);
  const [retencionPctInput, setRetencionPctInput] = useState(
    Number(factura.retencion_pct || 0) > 0 ? String(factura.retencion_pct) : defaultRetencion(entidad).pct
  );
  const primerRenderRetencion = useRef(true);
  useEffect(() => {
    if (primerRenderRetencion.current) {
      primerRenderRetencion.current = false;
      return;
    }
    if (cliente?.es_negocio && Number(cliente.retention_pct) > 0) {
      setRetencionActiva(true);
      setRetencionPctInput(String(cliente.retention_pct));
    } else {
      const d = defaultRetencion(entidad);
      setRetencionActiva(d.activa);
      setRetencionPctInput(d.pct);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const [listaServicios, setListaServicios] = useState<ServicioCat[]>(servicios);
  const [lineas, setLineas] = useState<Linea[]>(
    itemsIniciales.length > 0
      ? itemsIniciales.map((it) => ({
          descripcion: it.descripcion,
          detalle: it.detalle ?? "",
          cantidad: String(it.cantidad || 1),
          precioUnitario: String(it.precio_unitario),
          servicioId: it.service_id,
        }))
      : [{ descripcion: "", detalle: "", cantidad: "1", precioUnitario: "", servicioId: null }]
  );

  function actualizarLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
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
  function agregarDesdeServicio(servicioId: string, catalogo: ServicioCat[] = listaServicios) {
    const s = catalogo.find((x) => x.id === servicioId);
    if (!s) return;
    setLineas((prev) => {
      const vacias = prev.filter((l) => !l.descripcion.trim());
      const nueva = { descripcion: s.nombre, detalle: s.descripcion ?? "", cantidad: "1", precioUnitario: String(s.precio), servicioId: s.id };
      return vacias.length === prev.length ? [nueva] : [...prev.filter((l) => l.descripcion.trim()), nueva];
    });
  }
  // Estilo FreshBooks (1 sept 2026, pedido de Joel): el catálogo vive
  // dentro de cada línea — al elegir un servicio del buscador de ESA línea,
  // se llena esa línea específica (no se añade una línea nueva).
  function elegirServicioParaLinea(i: number, servicioId: string) {
    const s = listaServicios.find((x) => x.id === servicioId);
    if (!s) return;
    setLineas((prev) =>
      prev.map((l, idx) =>
        idx === i
          ? { descripcion: s.nombre, detalle: s.descripcion ?? "", cantidad: l.cantidad || "1", precioUnitario: String(s.precio), servicioId: s.id }
          : l
      )
    );
  }

  const [mostrarNuevoServicio, setMostrarNuevoServicio] = useState(false);
  const [nuevoServicioNombre, setNuevoServicioNombre] = useState("");
  const [nuevoServicioDescripcion, setNuevoServicioDescripcion] = useState("");
  const [nuevoServicioTipo, setNuevoServicioTipo] = useState<"fijo" | "hora" | "proyecto" | "recurrente">("fijo");
  const [nuevoServicioPrecio, setNuevoServicioPrecio] = useState("");
  const [nuevoServicioIvuExento, setNuevoServicioIvuExento] = useState(false);
  const [guardandoServicio, setGuardandoServicio] = useState(false);

  async function crearServicioDesdeFactura() {
    if (!nuevoServicioNombre.trim() || !nuevoServicioPrecio) return;
    setGuardandoServicio(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada — vuelve a entrar.");
      setGuardandoServicio(false);
      return;
    }

    const { data: nuevo, error: insertError } = await supabase
      .from("services")
      .insert({
        owner_id: user.id,
        entity_id: entidad?.id ?? null,
        nombre: nuevoServicioNombre.trim(),
        descripcion: nuevoServicioDescripcion.trim() || null,
        tipo: nuevoServicioTipo,
        precio: Number(nuevoServicioPrecio),
        ivu_exento: nuevoServicioIvuExento,
      })
      .select("id, nombre, descripcion, tipo, precio, ivu_exento")
      .single();

    setGuardandoServicio(false);

    if (insertError || !nuevo) {
      setError(insertError?.message ?? "No se pudo crear el servicio.");
      return;
    }

    const catalogoActualizado = [...listaServicios, nuevo as ServicioCat];
    setListaServicios(catalogoActualizado);
    agregarDesdeServicio(nuevo.id, catalogoActualizado);
    setNuevoServicioNombre("");
    setNuevoServicioDescripcion("");
    setNuevoServicioPrecio("");
    setNuevoServicioIvuExento(false);
    setMostrarNuevoServicio(false);
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
  // Depósito (2 sept 2026) — mismo campo que Nueva Factura.
  const [depositoInput, setDepositoInput] = useState(
    factura.deposito_monto ? String(factura.deposito_monto) : ""
  );
  const depositoMonto = Number(depositoInput) || 0;
  const [loading, setLoading] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Misma lógica de exención de IVU por línea que en nueva-factura-form.tsx
  // (1 sept 2026, pedido de Joel).
  function lineaEsIvuExenta(l: Linea): boolean {
    if (!l.servicioId) return false;
    const s = listaServicios.find((x) => x.id === l.servicioId);
    return s ? s.ivu_exento : false;
  }

  const subtotal = lineas.reduce((sum, l) => sum + sumaLinea(l), 0);
  const subtotalGravable = lineas.reduce((sum, l) => sum + (lineaEsIvuExenta(l) ? 0 : sumaLinea(l)), 0);
  const ivuPct =
    entidad?.ivu_applies && !cliente?.ivu_exempt_reseller
      ? Number(entidad.ivu_rate_estatal || 0) + Number(entidad.ivu_rate_municipal || 0)
      : 0;
  const ivuMonto = subtotalGravable * (ivuPct / 100);
  const retencionPct = retencionActiva ? Number(retencionPctInput) || 0 : 0;
  const retencionMonto = subtotal * (retencionPct / 100);
  const total = subtotal + ivuMonto - retencionMonto;
  const balanceAPagar = total - depositoMonto;
  const feeStripeEstimado = (subtotal + ivuMonto) * STRIPE_FEE_PCT + STRIPE_FEE_FIJO;
  const feeAthEstimado = entidad?.ath_movil_business_path
    ? Math.max((subtotal + ivuMonto) * ATH_FEE_PCT, ATH_FEE_MINIMO)
    : 0;
  const recibirasConAth = total - feeAthEstimado;

  function avanzarFecha(fechaISO: string, frecuencia: string): string {
    const d = new Date(`${fechaISO}T00:00:00Z`);
    if (frecuencia === "semanal") d.setUTCDate(d.getUTCDate() + 7);
    else if (frecuencia === "quincenal") d.setUTCDate(d.getUTCDate() + 15);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  }

  async function guardar() {
    if (!entidad || !cliente) return;
    const lineasValidas = lineas.filter((l) => l.descripcion.trim() && sumaLinea(l) > 0);
    // Misma excepción que en nueva-factura-form.tsx: un borrador asignado a
    // técnico puede quedarse sin líneas — es una "tarea" que el técnico
    // completa en su app, no una factura lista para enviar.
    const esTareaVaciaParaTecnico = factura.estado === "borrador" && !!technicianId;
    if (lineasValidas.length === 0 && !esTareaVaciaParaTecnico) {
      setError("Añade al menos un servicio con descripción y precio mayor a $0.");
      return;
    }

    setLoading(true);
    setError(null);

    // Igual que en nueva-factura-form.tsx: el toggle también queda
    // guardado en el cliente para que la próxima factura ya salga bien.
    if (cliente.es_negocio !== retencionActiva || (retencionActiva && Number(cliente.retention_pct) !== retencionPct)) {
      await supabase
        .from("clients")
        .update({ es_negocio: retencionActiva, retention_pct: retencionActiva ? retencionPct : 0 })
        .eq("id", cliente.id);
    }

    const primerServicioId = lineasValidas.find((l) => l.servicioId)?.servicioId ?? null;

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        entity_id: entidad.id,
        client_id: cliente.id,
        servicio_id: primerServicioId,
        technician_id: technicianId || null,
        subtotal,
        ivu_pct: ivuPct,
        ivu_monto: ivuMonto,
        retencion_pct: retencionPct,
        retencion_monto: retencionMonto,
        total,
        deposito_monto: depositoMonto,
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

    // Más simple y confiable que reconciliar línea por línea: borra las
    // líneas viejas y mete las nuevas de una vez (mismo patrón que
    // editar-cotizacion-form.tsx).
    const { error: deleteError } = await supabase.from("invoice_items").delete().eq("invoice_id", factura.id);
    if (deleteError) {
      setLoading(false);
      setError(deleteError.message);
      return;
    }

    const { error: itemsError } = await supabase.from("invoice_items").insert(
      lineasValidas.map((l) => ({
        invoice_id: factura.id,
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
          <SelectorBuscable
            items={clientesDeEntidad}
            valorId={clientId}
            onSeleccionar={setClientId}
            placeholder="Buscar cliente..."
            etiqueta={(c) =>
              `${c.name}${c.es_negocio && Number(c.retention_pct) > 0 ? ` (Créd. Hacienda ${Number(c.retention_pct)}%)` : ""}`
            }
          />
        </Field>

        {cliente && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Cliente te retiene</p>
              <p className="text-xs text-muted">Retención automática (Sección 1062.03)</p>
            </div>
            {retencionActiva && (
              <input
                className="vc-input flex-shrink-0"
                style={{ width: 64 }}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={retencionPctInput}
                onChange={(e) => setRetencionPctInput(e.target.value)}
              />
            )}
            <button
              type="button"
              onClick={() => setRetencionActiva(!retencionActiva)}
              className="relative h-[17px] w-[30px] flex-shrink-0 rounded-full transition-colors"
              style={{ background: retencionActiva ? "#1D9E75" : "var(--border)" }}
            >
              <span
                className="absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white transition-all"
                style={{ left: retencionActiva ? "15px" : "2px" }}
              />
            </button>
          </div>
        )}

        {!addonTecnicosActivo ? (
          <div className="rounded-lg border border-teal/30 bg-teal/[.05] p-3 text-xs">
            <p className="font-medium text-teal">Add-on Equipo — $20.00/mes</p>
            <p className="mt-0.5 text-muted">
              Actívalo desde{" "}
              <Link href="/dashboard/equipo" className="underline">
                Equipo
              </Link>{" "}
              para poder asignar esta factura a un técnico.
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

        <button
          type="button"
          onClick={() => setMostrarNuevoServicio(!mostrarNuevoServicio)}
          className="-mt-1 text-left text-xs font-medium text-teal hover:opacity-80"
        >
          + Crear nuevo servicio en el catálogo...
        </button>

        {mostrarNuevoServicio && (
          <div className="vc-card !bg-bg flex flex-col gap-2.5">
            <p className="text-xs uppercase tracking-wide text-muted">Nuevo servicio</p>
            <input
              className="vc-input"
              placeholder="Nombre del servicio"
              value={nuevoServicioNombre}
              onChange={(e) => setNuevoServicioNombre(e.target.value)}
            />
            <input
              className="vc-input"
              placeholder="Descripción (opcional)"
              value={nuevoServicioDescripcion}
              onChange={(e) => setNuevoServicioDescripcion(e.target.value)}
            />
            <div className="flex gap-2">
              <select
                className="vc-input flex-1"
                value={nuevoServicioTipo}
                onChange={(e) => setNuevoServicioTipo(e.target.value as typeof nuevoServicioTipo)}
              >
                <option value="fijo">Precio fijo</option>
                <option value="hora">Por hora</option>
                <option value="proyecto">Por proyecto</option>
                <option value="recurrente">Recurrente</option>
              </select>
              <input
                className="vc-input w-28 flex-shrink-0"
                type="number"
                step="0.01"
                min="0"
                placeholder="Precio"
                value={nuevoServicioPrecio}
                onChange={(e) => setNuevoServicioPrecio(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={nuevoServicioIvuExento} onChange={(e) => setNuevoServicioIvuExento(e.target.checked)} />
              No aplica IVU (servicio profesional)
            </label>
            <button
              type="button"
              className="vc-btn-primary"
              style={{ width: "auto" }}
              disabled={!nuevoServicioNombre || !nuevoServicioPrecio || guardandoServicio}
              onClick={crearServicioDesdeFactura}
            >
              {guardandoServicio ? "Guardando..." : "Guardar servicio y añadirlo aquí"}
            </button>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Servicios de esta factura</label>
          <div className="flex flex-col gap-3">
            {lineas.map((l, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <ServicioComboBox
                    servicios={listaServicios}
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
                  placeholder="Cant."
                  value={l.cantidad}
                  onChange={(e) => actualizarLinea(i, "cantidad", e.target.value)}
                />
                <input
                  className="vc-input flex-shrink-0"
                  style={{ width: 96 }}
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
          <select className="vc-input" value={moraTipo} onChange={(e) => setMoraTipo(e.target.value as typeof moraTipo)}>
            <option value="ninguno">Sin recargo por mora</option>
            <option value="fijo">Monto fijo</option>
            <option value="porcentaje">Porcentaje</option>
          </select>
          {moraTipo !== "ninguno" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                className="vc-input flex-shrink-0"
                style={{ width: 96 }}
                type="number"
                min="0"
                step="0.01"
                placeholder={moraTipo === "porcentaje" ? "%" : "$"}
                value={moraMonto}
                onChange={(e) => setMoraMonto(e.target.value)}
              />
              <span className="flex-shrink-0 text-xs text-muted">después de</span>
              <input
                className="vc-input flex-shrink-0"
                style={{ width: 64 }}
                type="number"
                min="0"
                step="1"
                value={moraDias}
                onChange={(e) => setMoraDias(e.target.value)}
              />
              <span className="flex-shrink-0 text-xs text-muted">días</span>
            </div>
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
        </Field>

        <Field label="Depósito recibido (opcional)">
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

        <Field label="Notas para el cliente (opcional)">
          <textarea className="vc-input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Field>

        <div className="rounded-lg border border-teal bg-teal/[.04] p-3 text-sm">
          <p className="mb-1.5 text-xs uppercase tracking-wide text-teal">Vista del cliente</p>
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
          {depositoMonto > 0 && (
            <>
              <div className="flex justify-between py-0.5">
                <span className="text-muted">Depósito recibido</span>
                <span>-{formatMoney(depositoMonto)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-teal/30 pt-1.5 font-medium">
                <span>Balance a pagar</span>
                <span className="text-teal">{formatMoney(balanceAPagar)}</span>
              </div>
            </>
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
            <span>{formatMoney(total - feeStripeEstimado)}</span>
          </div>

          {entidad?.ath_movil_business_path ? (
            <>
              <div className="mt-2 flex justify-between border-t border-border pt-2 py-0.5">
                <span className="text-muted">Fee ATH Móvil Business estimado (2.25%, mín. $0.06)</span>
                <span className="text-red">-{formatMoney(feeAthEstimado)}</span>
              </div>
              <div className="mt-1 flex justify-between font-medium">
                <span>Recibirías si el cliente paga por {entidad.ath_movil_business_path}</span>
                <span>{formatMoney(recibirasConAth)}</span>
              </div>
            </>
          ) : (
            <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted">
              Configura tu pATH de ATH Móvil Business en{" "}
              <Link href="/dashboard/config" className="underline">
                Config
              </Link>{" "}
              para ver aquí cuánto te llega neto (2.25%, menos que Stripe).
            </p>
          )}
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

// Mismo componente que en nueva-factura-form.tsx.
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

// Mismo componente que en nueva-factura-form.tsx.
function SelectorBuscable<T extends { id: string }>({
  items,
  valorId,
  onSeleccionar,
  etiqueta,
  placeholder,
}: {
  items: T[];
  valorId: string;
  onSeleccionar: (id: string) => void;
  etiqueta: (item: T) => string;
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
    ? items.filter((i) => etiqueta(i).toLowerCase().includes(busqueda.trim().toLowerCase()))
    : items;

  return (
    <div className="relative" ref={ref}>
      <input
        className="vc-input"
        placeholder={placeholder}
        value={abierto ? busqueda : seleccionado ? etiqueta(seleccionado) : ""}
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
              {etiqueta(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
