"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
  client_retention_situation: string | null;
  ath_movil_business_path: string | null;
};

// Convierte el "relevo" de la entidad (0039: no | 10 | 6 | exento — lo que
// LE retienen a Joel sus clientes) en el % y el default de si el toggle de
// retención debe salir prendido o apagado cuando el cliente todavía no
// tiene su propio historial guardado.
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

// Varias líneas por factura (1 sept 2026, pedido de Joel — antes solo se
// podía facturar un servicio a la vez, igual que Cotización ya permitía).
// servicioId: referencia real al catálogo cuando la línea viene de "Añadir
// desde el catálogo" — se pierde (null) si el usuario escribe la
// descripción a mano, y es lo que permite calcular el IVU por línea y que
// el reporte "Ingresos por servicio" agrupe de verdad.
// detalle: descripción corta debajo del nombre, calcado de FreshBooks (ej.
// "AHA" / "Annual evaluation") — pedido de Joel, 1 sept 2026, con
// Invoice 0001540.pdf como ejemplo real.
type Linea = { descripcion: string; detalle: string; cantidad: string; precioUnitario: string; servicioId: string | null };

function sumaLinea(l: Linea): number {
  const cant = Number(l.cantidad) || 0;
  const precio = Number(l.precioUnitario) || 0;
  return cant * precio;
}

const METODOS_COBRO = ["ATH Móvil", "Transferencia / ACH", "Cheque", "Efectivo"];

// Fee real de Stripe en PR: 2.9% + $0.30 por transacción de tarjeta. Es
// solo un estimado informativo — no procesamos el cobro todavía, es para
// que Joel (o cualquier dueño) sepa qué le quedaría neto si decide cobrar
// con un link de pago de Stripe por su cuenta.
const STRIPE_FEE_PCT = 0.029;
const STRIPE_FEE_FIJO = 0.3;

// ATH Móvil Business: 2.25% por pago recibido, mínimo $0.06 — confirmado en
// el FAQ oficial de ATH Business (ath.business/preguntas), 2 sept 2026,
// pedido de Joel: "vi que ATH Movil Business como 2.25% por transaccion
// (menos que Stripe) sería buena opción". Solo informativo, igual que el
// estimado de Stripe — no procesamos el cobro, es para que Joel sepa qué le
// queda neto si el cliente le paga por su pATH.
const ATH_FEE_PCT = 0.0225;
const ATH_FEE_MINIMO = 0.06;

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
  tecnicos,
  addonTecnicosActivo,
}: {
  entities: Entity[];
  clients: Client[];
  servicios: ServicioCat[];
  conteosPorEntidad: Record<string, number>;
  tecnicos: TecnicoOpcion[];
  addonTecnicosActivo: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const entidad = entities.find((e) => e.id === entityId) ?? entities[0];

  const clientesDeEntidad = useMemo(
    () => clients.filter((c) => !c.entity_id || c.entity_id === entityId),
    [clients, entityId]
  );
  // Sin cliente por defecto (pedido de Joel, 1 sept 2026) — que arranque
  // vacío y el usuario escoja a propósito, en vez de asumir el primero de
  // la lista (que podía terminar en una factura al cliente equivocado si
  // no se fijaba en cambiarlo).
  const [clientId, setClientId] = useState("");
  const cliente = clientesDeEntidad.find((c) => c.id === clientId);

  // "Asignar a técnico" (Equipo, 2 sept 2026, pedido de Joel): el dueño
  // pre-crea la factura/tarea y la deja asignada — el técnico la ve en su
  // app, añade lo que hizo (o vende algo más) y la manda. Opcional; si se
  // deja en blanco la factura queda "de la casa" como siempre.
  const tecnicosDeEntidad = useMemo(
    () => tecnicos.filter((t) => !t.entity_id || t.entity_id === entityId),
    [tecnicos, entityId]
  );
  const [technicianId, setTechnicianId] = useState("");

  // Toggle "Cliente te retiene" (1 sept 2026, pedido de Joel): si el
  // cliente ya tiene su propio % guardado (es_negocio + retention_pct) se
  // usa ese; si no, arranca según el relevo por defecto de la entidad
  // (business_entities.client_retention_situation) — así la mayoría de las
  // facturas salen ya correctas y solo hay que apagar el toggle en las
  // excepciones que no retienen.
  const [retencionActiva, setRetencionActiva] = useState(false);
  const [retencionPctInput, setRetencionPctInput] = useState("10.00");
  useEffect(() => {
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
  const [lineas, setLineas] = useState<Linea[]>([
    { descripcion: "", detalle: "", cantidad: "1", precioUnitario: "", servicioId: null },
  ]);

  function actualizarLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        // Editar el nombre a mano desengancha la línea del catálogo — ya
        // no representa exactamente ese servicio, así que se trata como
        // una línea libre (servicioId null) para no contarla mal en
        // "Ingresos por servicio" ni en la exención de IVU del servicio.
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
  // Estilo FreshBooks (1 sept 2026, pedido de Joel): ya no hay un dropdown
  // aparte de "Añadir desde el catálogo" — el catálogo vive dentro de cada
  // línea. Al elegir un servicio del buscador de ESA línea, se llena esa
  // línea específica (no se añade una línea nueva ni se toca ninguna otra).
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

  // "+ Crear nuevo servicio..." — para que Joel no tenga que salirse del
  // formulario a la pestaña de Servicios cuando factura algo que todavía
  // no tenía guardado en el catálogo. Al guardar, el servicio nuevo se
  // añade como una línea más de la factura.
  const [mostrarNuevoServicio, setMostrarNuevoServicio] = useState(false);
  const [nuevoServicioNombre, setNuevoServicioNombre] = useState("");
  const [nuevoServicioDescripcion, setNuevoServicioDescripcion] = useState("");
  const [nuevoServicioTipo, setNuevoServicioTipo] = useState<"fijo" | "hora" | "proyecto" | "recurrente">("fijo");
  const [nuevoServicioPrecio, setNuevoServicioPrecio] = useState("");
  // Default cambiado a "sí aplica IVU" (false = no exento) — pedido de
  // Joel (1 sept 2026): la mayoría de servicios sí cobran IVU, la exención
  // es la excepción, no la regla.
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

  // Depósito (2 sept 2026, pedido de Joel): a veces el cliente paga un
  // adelanto antes de empezar el trabajo — se resta del total para mostrar
  // el balance real pendiente. Aquí, en Nueva Factura, representa un
  // depósito YA RECIBIDO (a diferencia de Cotización, donde es uno pedido
  // pero todavía no cobrado).
  const [depositoInput, setDepositoInput] = useState("");
  const depositoMonto = Number(depositoInput) || 0;

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

  // Exención de IVU por servicio (1 sept 2026, pedido de Joel): con varias
  // líneas por factura, el IVU se calcula por línea (solo sobre las
  // gravables) y se suma, en vez de un solo % sobre todo el subtotal. Una
  // línea libre (sin servicio del catálogo) se trata como gravable por
  // default — misma lógica que Nueva Cotización.
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

  // Cobro en línea real (que el cliente pague con tarjeta directo en la
  // app) todavía no está activo — este fee es solo un estimado informativo.
  const feeStripeEstimado = (subtotal + ivuMonto) * STRIPE_FEE_PCT + STRIPE_FEE_FIJO;
  const recibirasConTarjeta = total - feeStripeEstimado;

  // Estimado de ATH Móvil Business — solo se muestra si la entidad ya
  // configuró su pATH (Config → Facturas). Mismo criterio que el estimado
  // de Stripe: informativo, calculado sobre subtotal+IVU.
  const feeAthEstimado = entidad?.ath_movil_business_path
    ? Math.max((subtotal + ivuMonto) * ATH_FEE_PCT, ATH_FEE_MINIMO)
    : 0;
  const recibirasConAth = total - feeAthEstimado;

  const numeroPreview = entidad ? `${entidad.invoice_prefix}-${entidad.invoice_start_number + (conteosPorEntidad[entidad.id] ?? 0)}` : "";

  async function guardar(estadoInicial: "borrador" | "enviada") {
    if (!entidad || !cliente) return;
    const lineasValidas = lineas.filter((l) => l.descripcion.trim() && sumaLinea(l) > 0);
    if (lineasValidas.length === 0) {
      setError("Añade al menos un servicio con descripción y precio mayor a $0.");
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

    // El toggle "Cliente te retiene" queda guardado en el cliente también
    // (no solo en esta factura) para que la próxima factura a este mismo
    // cliente ya salga con el estado correcto sin tener que volver a
    // tocarlo — mismo campo que usa /dashboard/clientes.
    if (cliente.es_negocio !== retencionActiva || (retencionActiva && Number(cliente.retention_pct) !== retencionPct)) {
      await supabase
        .from("clients")
        .update({ es_negocio: retencionActiva, retention_pct: retencionActiva ? retencionPct : 0 })
        .eq("id", cliente.id);
    }

    // servicio_id de la factura (para compatibilidad con vistas viejas que
    // solo miran ese campo) queda apuntando al servicio de la primera
    // línea del catálogo, si hay alguna.
    const primerServicioId = lineasValidas.find((l) => l.servicioId)?.servicioId ?? null;

    const { data: factura, error: insertError } = await supabase
      .from("invoices")
      .insert({
        owner_id: user.id,
        entity_id: entidad.id,
        client_id: cliente.id,
        servicio_id: primerServicioId,
        technician_id: technicianId || null,
        numero: numeroPreview,
        subtotal,
        ivu_pct: ivuPct,
        ivu_monto: ivuMonto,
        retencion_pct: retencionPct,
        retencion_monto: retencionMonto,
        total,
        deposito_monto: depositoMonto,
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

    const { error: itemsError } = await supabase.from("invoice_items").insert(
      lineasValidas.map((l) => ({
        invoice_id: factura.id,
        // service_id (1 sept 2026) — referencia real al catálogo que usa
        // el reporte "Ingresos por servicio" para agrupar de verdad en vez
        // de por texto suelto.
        service_id: l.servicioId,
        descripcion: l.descripcion,
        detalle: l.detalle.trim() || null,
        cantidad: Number(l.cantidad) || 1,
        precio_unitario: Number(l.precioUnitario) || 0,
        subtotal_linea: sumaLinea(l),
      }))
    );

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
            <SelectorBuscable
              items={clientesDeEntidad}
              valorId={clientId}
              onSeleccionar={setClientId}
              placeholder="Buscar cliente..."
              etiqueta={(c) =>
                `${c.name}${c.es_negocio && Number(c.retention_pct) > 0 ? ` (Créd. Hacienda ${Number(c.retention_pct)}%)` : ""}`
              }
            />
          )}
        </Field>

        {cliente && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-bg p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Cliente te retiene</p>
              <p className="text-xs text-muted">Retención automática (Sección 1062.03)</p>
            </div>
            {retencionActiva && (
              // .vc-input trae width:100% del CSS global, que le gana a
              // clases de ancho de Tailwind (w-16) por orden de cascada —
              // por eso el ancho fijo va en style, no en className.
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
              {technicianId && (
                <p className="mt-1 text-xs text-muted">
                  {tecnicosDeEntidad.find((t) => t.id === technicianId)?.name} va a ver esta tarea en su app y puede añadir más
                  servicios antes de mandarla.
                </p>
              )}
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
                  {/* Buscador estilo FreshBooks (1 sept 2026, pedido de
                      Joel): al enfocar muestra el catálogo completo, al
                      escribir lo filtra, y al elegir uno llena esta línea
                      (nombre, descripción y precio). También se puede
                      escribir libre — deja de estar ligada al catálogo. */}
                  <ServicioComboBox
                    servicios={listaServicios}
                    valor={l.descripcion}
                    onCambiarTexto={(v) => actualizarLinea(i, "descripcion", v)}
                    onElegirServicio={(servicioId) => elegirServicioParaLinea(i, servicioId)}
                    placeholder="Nombre del servicio"
                  />
                  {/* Descripción chiquita debajo del nombre — calcado de
                      FreshBooks (ej. "AHA" / "Annual evaluation"), pedido
                      de Joel el 1 sept 2026 con Invoice 0001540.pdf. */}
                  <input
                    className="vc-input"
                    style={{ fontSize: 12 }}
                    placeholder="Descripción (opcional)"
                    value={l.detalle}
                    onChange={(e) => actualizarLinea(i, "detalle", e.target.value)}
                  />
                </div>
                {/* Ancho fijo en style, no en className: .vc-input trae
                    width:100% del CSS global que le gana a w-16/w-24 de
                    Tailwind por orden de cascada — sin esto, estos dos
                    inputs se salían de la tarjeta ("todo corrida"). */}
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
          <p className="mt-1 text-xs text-muted">Si el cliente ya te adelantó parte del pago, ponlo aquí — se resta del total.</p>
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
          {entidad?.ivu_applies && (
            // Siempre visible si la entidad cobra IVU, aunque salga en
            // $0.00 (ej. todos los servicios de esta factura son exentos)
            // — igual que FreshBooks siempre muestra la fila de "Tax",
            // pedido de Joel el 1 sept 2026.
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

        <button className="vc-btn-primary mt-1" disabled={loading || !cliente} onClick={() => guardar("enviada")}>
          {loading ? "Guardando..." : (
            <>
              <i className="ti ti-send" /> Enviar factura
            </>
          )}
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

// Buscador de servicios estilo FreshBooks (1 sept 2026, pedido de Joel —
// "AHI ES QUE VIVEN TODOS LOS SERVICIOS Y PUEDES ESCOGER"): a diferencia de
// SelectorBuscable, este SÍ deja escribir texto libre (no hay que elegir
// algo del catálogo para que el campo tenga valor) — el valor del input ES
// la descripción de la línea, y el dropdown es solo un atajo para llenarla
// desde el catálogo.
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

// Combobox con búsqueda (1 sept 2026, pedido de Joel — con 44 clientes
// importados de FreshBooks, un <select> normal se vuelve incómodo). Es un
// input de texto: al hacer foco muestra la lista completa, al escribir la
// filtra, y al perder el foco vuelve a mostrar el nombre del que quedó
// seleccionado.
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
