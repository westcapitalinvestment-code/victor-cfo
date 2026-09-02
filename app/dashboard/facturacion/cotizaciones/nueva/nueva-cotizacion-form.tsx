"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

type Entity = { id: string; name: string; ivu_applies: boolean; ivu_rate_estatal: number; ivu_rate_municipal: number };
type Client = { id: string; name: string; entity_id: string | null; ivu_exempt_reseller: boolean };
type ServicioCat = { id: string; nombre: string; descripcion: string | null; tipo: string; precio: number; ivu_exento: boolean };
// servicioId (1 sept 2026): referencia real al catálogo cuando la línea
// viene de "Elegir un servicio guardado" — se pierde (queda null) si el
// usuario edita la descripción a mano o añade una línea libre con "+
// Añadir línea". Es lo que permite que el reporte "Ingresos por servicio"
// agrupe de verdad en vez de por el texto exacto de la descripción.
// detalle: descripción corta debajo del nombre, calcado de FreshBooks (ej.
// "AHA" / "Annual evaluation") — pedido de Joel, 1 sept 2026.
type Linea = { descripcion: string; detalle: string; cantidad: string; precioUnitario: string; servicioId: string | null };

function sumaLinea(l: Linea): number {
  const cant = Number(l.cantidad) || 0;
  const precio = Number(l.precioUnitario) || 0;
  return cant * precio;
}

export default function NuevaCotizacionForm({
  entities,
  clients,
  servicios,
  numeroInicial,
}: {
  entities: Entity[];
  clients: Client[];
  servicios: ServicioCat[];
  numeroInicial: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const entidad = entities.find((e) => e.id === entityId) ?? entities[0];

  const clientesDeEntidad = useMemo(
    () => clients.filter((c) => !c.entity_id || c.entity_id === entityId),
    [clients, entityId]
  );
  // Sin cliente ni fecha por defecto (pedido de Joel, 1 sept 2026) — que
  // arranquen vacíos y el usuario escoja/busque a propósito, en vez de
  // asumir el primer cliente de la lista o una fecha ya calculada (mismo
  // criterio ya aplicado en Nueva Factura).
  const [clientId, setClientId] = useState("");
  const cliente = clientesDeEntidad.find((c) => c.id === clientId);

  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([
    { descripcion: "", detalle: "", cantidad: "1", precioUnitario: "", servicioId: null },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function actualizarLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        // Editar la descripción a mano desengancha la línea del catálogo
        // — ya no representa exactamente ese servicio, así que se trata
        // como una línea libre (servicioId null) para no contarla mal en
        // "Ingresos por servicio".
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

  // Exención de IVU por servicio (1 sept 2026, pedido de Joel): antes esta
  // cotización cobraba IVU sobre TODO el subtotal sin mirar si algún
  // servicio del catálogo está marcado "No aplica IVU" — a diferencia de
  // Nueva Factura, que sí lo respeta. Con varias líneas por cotización, el
  // IVU se calcula por línea (solo sobre las gravables) y se suma, en vez
  // de un solo % sobre todo el subtotal.
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

  async function guardar() {
    if (!entidad || !cliente) return;
    if (!fechaVencimiento) {
      setError("Escoge la fecha de vencimiento de la cotización.");
      return;
    }
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

    const { data: cotizacion, error: insertError } = await supabase
      .from("cotizaciones")
      .insert({
        owner_id: user.id,
        entity_id: entidad.id,
        client_id: cliente.id,
        numero: numeroInicial,
        subtotal,
        ivu_pct: ivuPct,
        ivu_monto: ivuMonto,
        total,
        estado: "enviada",
        fecha_emision: hoy,
        fecha_vencimiento: fechaVencimiento,
        notas: notas || null,
      })
      .select("id")
      .maybeSingle();

    if (insertError || !cotizacion) {
      setError(insertError?.message || "No se pudo crear la cotización.");
      setLoading(false);
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
        <h1 className="text-lg font-medium">Nueva cotización</h1>
        <button onClick={() => router.push("/dashboard/facturacion?tab=cotizaciones")} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <p className="text-xs text-muted">
          Número: <span className="font-medium text-text">{numeroInicial}</span>
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
              etiqueta={(c) => c.name}
            />
          )}
        </Field>

        <Field label="Válida hasta">
          <input
            className="vc-input"
            type="date"
            value={fechaVencimiento}
            onChange={(e) => setFechaVencimiento(e.target.value)}
          />
        </Field>

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
                  {/* Descripción chiquita debajo del nombre — calcado de
                      FreshBooks (ej. "AHA" / "Annual evaluation"), pedido
                      de Joel el 1 sept 2026. */}
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

        <Field label="Notas (opcional)">
          <textarea
            className="vc-input"
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Alcance del trabajo, condiciones, etc."
          />
        </Field>

        <div className="rounded-lg border border-border bg-bg p-3 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-muted">Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          {entidad?.ivu_applies && (
            // Siempre visible si la entidad cobra IVU, aunque salga en
            // $0.00 (ej. todas las líneas son de un servicio exento) —
            // igual que en Nueva Factura (pedido de Joel, 1 sept 2026).
            <div className="flex justify-between py-0.5">
              <span className="text-muted">IVU ({ivuPct}%)</span>
              <span>+{formatMoney(ivuMonto)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
            <span>Total</span>
            <span>{formatMoney(total)}</span>
          </div>
        </div>

        <button className="vc-btn-primary mt-1" disabled={loading || !cliente || !fechaVencimiento} onClick={guardar}>
          {loading ? "Guardando..." : "Guardar cotización"}
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
// mismo componente que en Nueva/Editar Factura): a diferencia de
// SelectorBuscable, deja escribir texto libre — el valor del input ES la
// descripción de la línea, y el dropdown es un atajo para llenarla desde
// el catálogo.
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

// Combobox con búsqueda (mismo componente que Nueva/Editar Factura, 1 sept
// 2026 — con muchos clientes importados de FreshBooks, un <select> normal
// se vuelve incómodo). Es un input de texto: al hacer foco muestra la
// lista completa, al escribir la filtra, y al perder el foco vuelve a
// mostrar el nombre del que quedó seleccionado.
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
