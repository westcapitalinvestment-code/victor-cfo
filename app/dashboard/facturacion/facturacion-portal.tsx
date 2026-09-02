"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatFecha } from "@/lib/format";

type Cliente = {
  id: string;
  name: string;
  email: string | null;
  es_negocio: boolean;
  retention_pct: number;
  entity_id: string | null;
  active: boolean;
};

type Factura = {
  id: string;
  numero: string;
  subtotal: number;
  retencion_pct: number;
  retencion_monto: number;
  total: number;
  estado: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  // Fecha real en que llegó el pago (migración 0046) — distinta de
  // fecha_emision. Nula en facturas marcadas pagadas antes de este campo
  // existir; el código hace fallback a fecha_emision en esos casos.
  fecha_pago: string | null;
  // Método real con que se cobró (2 sept 2026) — es lo único que dice de
  // verdad si una factura pagada pasó por ATH Móvil Business o tarjeta
  // (Stripe), para poder estimar el gasto de procesamiento de pagos real,
  // no solo hipotético.
  metodo_pago: string | null;
  entity_id: string | null;
  client_id: string | null;
  clients: { name: string } | null;
};

// ATH Móvil Business: 2.25% por pago recibido, mínimo $0.06 (confirmado en
// ath.business/preguntas). Stripe: ~2.9% + $0.30 por transacción de
// tarjeta. Mismos datos que en Nueva/Editar Factura — aquí se usan para
// sumar, sobre facturas YA PAGADAS y marcadas con ese método real, cuánto
// se fue en procesamiento (gasto deducible), pedido de Joel el 2 sept 2026:
// "para deducir esa partida de ATH Movil Negocio y Stripe en su momento".
const ATH_FEE_PCT = 0.0225;
const ATH_FEE_MINIMO = 0.06;
const STRIPE_FEE_PCT = 0.029;
const STRIPE_FEE_FIJO = 0.3;

// Preview en vivo del fee al momento de registrar el pago (2 sept 2026,
// pedido de Joel: "debe cambiar arriba y añadir esos $[fee] de fee pq no
// hay manera de ajustarlo"). A diferencia de feeProcesamiento() de abajo,
// aquí no hace falta el gate de entidadesConAth: el usuario ya está
// escogiendo el método a mano, así que si elige "ATH Móvil Business" es
// porque ese pago sí fue por el pATH.
function feeEstimadoPago(total: number, metodo: string): number {
  if (metodo === "ATH Móvil Business") return Math.max(total * ATH_FEE_PCT, ATH_FEE_MINIMO);
  if (metodo === "Tarjeta") return total * STRIPE_FEE_PCT + STRIPE_FEE_FIJO;
  return 0;
}

// El fee de 2.25% SOLO es real cuando el cliente pagó al pATH de la entidad
// (ATH Móvil Business) — un ATH Móvil personal (transferencia normal entre
// personas) no cobra fee ninguno. El primer intento de este gate (2 sept
// 2026) asumía que CUALQUIER pago marcado "ATH Móvil" en una entidad con
// pATH configurado pasó por el pATH, pero eso seguía siendo falso: Joel
// tiene su pATH configurado y aun así su único pago por ATH fue personal,
// no por el pATH (bug reportado 2 sept: "ninguna cobro fees, no se de dnd
// saca esos fees"). El dato real solo lo sabe Joel al marcar la factura
// pagada, así que ahora "ATH Móvil" y "ATH Móvil Business" son dos métodos
// de pago distintos en el dropdown — el fee solo aplica al segundo. El
// chequeo de entidadesConAth se mantiene como salvaguarda extra (no debería
// poder pasar, pero si por error queda marcada "ATH Móvil Business" en una
// entidad sin pATH, no se le inventa un fee).
function feeProcesamiento(f: Factura, entidadesConAth: Set<string>): number {
  if (f.metodo_pago === "ATH Móvil Business") {
    if (!f.entity_id || !entidadesConAth.has(f.entity_id)) return 0;
    return Math.max(Number(f.total) * ATH_FEE_PCT, ATH_FEE_MINIMO);
  }
  if (f.metodo_pago === "Tarjeta") return Number(f.total) * STRIPE_FEE_PCT + STRIPE_FEE_FIJO;
  return 0;
}

type Servicio = {
  id: string;
  nombre: string;
  // Descripción corta opcional (1 sept 2026, pedido de Joel — calcado de
  // FreshBooks: el nombre sale en negrita y la descripción debajo, más
  // pequeña, ej. "AHA" / "Annual evaluation"). Se copia a cada línea de
  // factura/cotización cuando se elige el servicio del catálogo.
  descripcion: string | null;
  tipo: string;
  precio: number;
  ivu_exento: boolean;
  activo: boolean;
  entity_id: string | null;
};

type Cotizacion = {
  id: string;
  numero: string;
  total: number;
  estado: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  client_id: string | null;
  clients: { name: string } | null;
};

// returnTo del portal (1 sept 2026, fix pedido por Joel: "si borro un
// cliente se sale y cae en la pantalla de facturas"). El bug era que
// returnTo apuntaba a "/dashboard/facturacion" a secas — sin el ?tab=, la
// página vuelve a caer en la pestaña por defecto (Facturas) en vez de
// quedarse en Clientes, que es donde el usuario estaba trabajando.
// encodeURIComponent porque returnTo en sí es un query param — sin esto,
// el "?tab=clientes" se lee como un query param SUELTO de la página de
// destino (importar/nuevo/editar cliente) en vez de quedar pegado dentro
// del valor de returnTo.
const RETURN_TO_TAB_CLIENTES = encodeURIComponent("/dashboard/facturacion?tab=clientes");

const TABS = [
  { id: "facturas", label: "Facturas", icon: "ti-file-invoice" },
  { id: "cotizaciones", label: "Cotizaciones", icon: "ti-file-description" },
  { id: "clientes", label: "Clientes", icon: "ti-users" },
  { id: "servicios", label: "Servicios", icon: "ti-package" },
  { id: "reportes", label: "Reportes", icon: "ti-chart-bar" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Paleta de colores para los avatares de iniciales — calcada de los tonos
// que usa el mockup (verde, morado, rojo, azul, café). El color se elige
// por hash del id del cliente, así el mismo cliente siempre sale con el
// mismo color en toda la app, sin tener que guardar nada nuevo en la base
// de datos.
const COLORES_AVATAR = ["#0F6E56", "#534AB7", "#A32D2D", "#185FA5", "#854F0B", "#1D9E75", "#B7590F"];

function colorAvatar(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COLORES_AVATAR[hash % COLORES_AVATAR.length];
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function estaVencida(f: Factura): boolean {
  return f.estado !== "pagada" && f.estado !== "borrador" && !!f.fecha_vencimiento && f.fecha_vencimiento < hoyISO();
}

function estadoMostrado(f: Factura): string {
  if (f.estado === "pagada" || f.estado === "borrador") return f.estado;
  return estaVencida(f) ? "vencida" : f.estado;
}

function Badge({ estado }: { estado: string }) {
  const estilos: Record<string, string> = {
    borrador: "bg-border text-muted",
    enviada: "bg-teal/10 text-teal",
    pagada: "bg-teal text-white",
    vencida: "bg-red/10 text-red",
  };
  const etiquetas: Record<string, string> = {
    borrador: "Borrador",
    enviada: "Enviada",
    pagada: "Pagada",
    vencida: "Vencida",
  };
  return (
    <span className={`rounded px-2 py-1 text-xs font-medium ${estilos[estado] ?? "bg-border text-muted"}`}>
      {etiquetas[estado] ?? estado}
    </span>
  );
}

export default function FacturacionPortal({
  clients,
  facturas,
  servicios,
  cotizaciones,
  entidadId,
  entidadesConAth,
  tabInicial,
}: {
  clients: Cliente[];
  facturas: Factura[];
  servicios: Servicio[];
  cotizaciones: Cotizacion[];
  entidadId: string | null;
  entidadesConAth: string[];
  tabInicial?: string;
}) {
  const tabValido = TABS.some((t) => t.id === tabInicial);
  const [tab, setTab] = useState<TabId>(tabValido ? (tabInicial as TabId) : "facturas");
  const entidadesConAthSet = useMemo(() => new Set(entidadesConAth), [entidadesConAth]);

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-muted hover:opacity-80">
          ← VICTOR
        </Link>
      </div>

      <div className="mb-4 rounded-2xl border border-teal bg-teal/[.04] p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-lg font-medium">Facturación</p>
            <p className="text-xs text-muted">Portal completo</p>
          </div>
          {entidadId && (
            <Link
              href={`/dashboard/entidades/${entidadId}/editar`}
              className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-teal hover:opacity-80"
            >
              <i className="ti ti-settings" style={{ fontSize: 14 }} />
              Editar negocio
            </Link>
          )}
        </div>
        <div
          className="flex"
          style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 4, gap: 3 }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-1 flex-col items-center gap-0.5"
              style={{
                padding: "9px 4px",
                fontSize: 11,
                fontWeight: 500,
                lineHeight: 1.2,
                textAlign: "center",
                color: tab === t.id ? "#1D9E75" : "var(--muted)",
                borderBottom: tab === t.id ? "2px solid #1D9E75" : "2px solid transparent",
                background: "none",
              }}
            >
              <i className={`ti ${t.icon}`} style={{ fontSize: 17 }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "facturas" && <FacturasTab facturas={facturas} entidadesConAth={entidadesConAthSet} />}
      {tab === "clientes" && <ClientesTab clients={clients} />}
      {tab === "cotizaciones" && <CotizacionesTab cotizaciones={cotizaciones} />}
      {tab === "servicios" && <ServiciosTab servicios={servicios} entidadId={entidadId} />}
      {tab === "reportes" && (
        <ReportesTab facturas={facturas} clients={clients} servicios={servicios} entidadId={entidadId} entidadesConAth={entidadesConAthSet} />
      )}
    </div>
  );
}

function Proximamente({ icono, titulo, texto }: { icono: string; titulo: string; texto: string }) {
  return (
    <div className="vc-card text-center">
      <i className={`ti ${icono} mb-2 text-2xl text-teal`} />
      <p className="mb-1 text-sm font-medium">{titulo}</p>
      <p className="text-xs text-muted">{texto}</p>
      <p className="mt-3 text-xs font-medium text-teal">Próximamente</p>
    </div>
  );
}

function FacturasTab({ facturas, entidadesConAth }: { facturas: Factura[]; entidadesConAth: Set<string> }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todas");

  const noBorrador = facturas.filter((f) => f.estado !== "borrador");
  const facturado = noBorrador.reduce((s, f) => s + Number(f.total), 0);
  const cobradas = facturas.filter((f) => f.estado === "pagada");
  const cobrado = cobradas.reduce((s, f) => s + Number(f.total), 0);
  const pendientes = facturas.filter((f) => f.estado === "enviada" && !estaVencida(f));
  const pendiente = pendientes.reduce((s, f) => s + Number(f.total), 0);
  const vencidas = facturas.filter((f) => estaVencida(f));
  const vencida = vencidas.reduce((s, f) => s + Number(f.total), 0);
  const pctCobrado = facturado > 0 ? Math.round((cobrado / facturado) * 100) : 0;
  const creditosHacienda = cobradas.reduce((s, f) => s + Number(f.retencion_monto || 0), 0);
  const gastoProcesamiento = cobradas.reduce((s, f) => s + feeProcesamiento(f, entidadesConAth), 0);

  const filtradas = useMemo(() => {
    return facturas.filter((f) => {
      const estado = estadoMostrado(f);
      if (filtro === "pagadas" && estado !== "pagada") return false;
      if (filtro === "pendientes" && estado !== "enviada") return false;
      if (filtro === "vencidas" && estado !== "vencida") return false;
      if (filtro === "borradores" && estado !== "borrador") return false;
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        const nombre = f.clients?.name?.toLowerCase() ?? "";
        if (!nombre.includes(q) && !f.numero.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [facturas, filtro, busqueda]);

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Facturado" valor={formatMoney(facturado)} sub={`${noBorrador.length} facturas`} />
        <StatCard label="Cobrado" valor={formatMoney(cobrado)} sub={`${pctCobrado}%`} tono="g" />
        <StatCard label="Pendiente" valor={formatMoney(pendiente)} sub={`${pendientes.length} fact.`} tono="a" />
        <StatCard label="Vencida" valor={formatMoney(vencida)} sub={`${vencidas.length} fact.`} tono="r" />
      </div>

      <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-card p-3">
        <i className="ti ti-coins flex-shrink-0 text-lg text-teal" />
        <div className="flex-1">
          <p className="text-xs font-medium">Créditos en Hacienda</p>
          <p className="text-xs text-muted">{formatMoney(creditosHacienda)} acumulado</p>
        </div>
        <span className="text-sm font-medium text-teal">{formatMoney(creditosHacienda)}</span>
      </div>

      {gastoProcesamiento > 0 && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-card p-3">
          <i className="ti ti-credit-card flex-shrink-0 text-lg text-red" />
          <div className="flex-1">
            <p className="text-xs font-medium">Gasto procesamiento de pagos</p>
            <p className="text-xs text-muted">ATH Móvil Business + Stripe, sobre facturas ya pagadas — deducible</p>
          </div>
          <span className="text-sm font-medium text-red">-{formatMoney(gastoProcesamiento)}</span>
        </div>
      )}

      <div className="mb-3 flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-teal" />
          <input
            className="vc-input w-full min-w-0"
            style={{ paddingLeft: 32 }}
            placeholder="Buscar..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select
          className="vc-input flex-shrink-0 px-1.5"
          style={{ width: 92 }}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="todas">Todas</option>
          <option value="pagadas">Pagadas</option>
          <option value="pendientes">Pendientes</option>
          <option value="vencidas">Vencidas</option>
          <option value="borradores">Borradores</option>
        </select>
        <Link
          href="/dashboard/facturacion/nueva"
          className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2.5 text-xs font-medium text-white hover:opacity-90"
          style={{ background: "#1D9E75", width: "auto" }}
        >
          <i className="ti ti-plus" /> Nueva
        </Link>
      </div>

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Todas las facturas</p>
        {filtradas.length === 0 && <p className="text-xs text-muted">No hay facturas que coincidan.</p>}
        {filtradas.map((f) => (
          <FilaFactura key={f.id} factura={f} />
        ))}
      </div>
    </>
  );
}

// Fusionado con lo que antes era el tab "Cobros" (1 sept 2026, pedido de
// Joel: "quitalo y añade el boton, seria como fusionar todo en Facturas") —
// cada fila ahora trae su propio "Registrar pago" inline, con el mismo
// aviso de retención que tenía CobrosTab, en vez de vivir en una pestaña
// aparte que no aportaba nada que Facturas no tuviera ya. También se le
// añadió un hover al nombre/fila (cambio de color + fondo) para que se
// note que es clickeable, ya que ahora el Link solo envuelve esa parte y
// no toda la fila (el botón de pago necesita vivir fuera del <a>).
function FilaFactura({ factura }: { factura: Factura }) {
  const supabase = createClient();
  const router = useRouter();
  const nombre = factura.clients?.name ?? "Sin cliente";
  const [pagando, setPagando] = useState(false);
  const [metodoPago, setMetodoPago] = useState(METODOS_PAGO[0]);
  // Fecha real del pago (2 sept 2026, pedido de Joel: "el pago salio el dia
  // 1 pero me pago el dia 2 y tal como esta sale que todos pagaran el dia
  // 1") — por defecto hoy, pero editable porque el pago pudo haber llegado
  // otro día.
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeRegistrarPago = factura.estado !== "pagada" && factura.estado !== "borrador";

  async function marcarPagada() {
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ estado: "pagada", metodo_pago: metodoPago, fecha_pago: fechaPago })
      .eq("id", factura.id);
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPagando(false);
    router.refresh();
  }

  return (
    <div className="border-b border-border py-2.5 last:border-0">
      <div className="flex items-center gap-2.5">
        <Link
          href={`/dashboard/facturacion/${factura.id}`}
          className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg -m-1 p-1 transition-colors hover:bg-bg"
        >
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
            style={{ background: colorAvatar(factura.client_id ?? factura.id) }}
          >
            {iniciales(nombre)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm transition-colors group-hover:text-teal">{nombre}</p>
            <p className="truncate text-xs text-muted">
              #{factura.numero} · {formatFecha(factura.fecha_emision)}
            </p>
          </div>
        </Link>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-medium">{formatMoney(Number(factura.total))}</span>
          <Badge estado={estadoMostrado(factura)} />
        </div>
      </div>

      {puedeRegistrarPago && !pagando && (
        <div className="mt-1.5 pl-[42px]">
          <button
            className="rounded-lg border border-teal px-2.5 py-1.5 text-xs font-medium text-teal hover:opacity-80"
            onClick={() => setPagando(true)}
          >
            Registrar pago
          </button>
        </div>
      )}

      {pagando && (
        <div className="mt-2 flex flex-col gap-2 pl-[42px]">
          {error && <p className="text-xs text-red">{error}</p>}
          {(Number(factura.retencion_pct) > 0 || feeEstimadoPago(Number(factura.total), metodoPago) > 0) && (
            <div className="rounded-lg border border-border bg-bg p-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Total que debía cobrar</span>
                <span className="font-medium">{formatMoney(Number(factura.total))}</span>
              </div>
              {Number(factura.retencion_pct) > 0 && (
                <div className="flex justify-between">
                  <span className="text-amb">Retención ({factura.retencion_pct}%) que el cliente debía depositar</span>
                  <span className="font-medium text-amb">{formatMoney(Number(factura.retencion_monto))}</span>
                </div>
              )}
              {/* Fee de procesamiento en vivo según el método elegido (2 sept
                  2026, pedido de Joel: "debe cambiar arriba y añadir esos
                  $[fee] de fee pq no hay manera de ajustarlo") — antes solo
                  aparecía después, en el reporte, sin avisar al momento de
                  registrar el pago. */}
              {feeEstimadoPago(Number(factura.total), metodoPago) > 0 && (
                <div className="flex justify-between">
                  <span className="text-red">
                    Fee {metodoPago} ({metodoPago === "Tarjeta" ? "2.9% + $0.30" : "2.25%, mín. $0.06"})
                  </span>
                  <span className="font-medium text-red">-{formatMoney(feeEstimadoPago(Number(factura.total), metodoPago))}</span>
                </div>
              )}
              <p className="mt-1 text-muted">
                ¿No coincide con lo que recibiste?{" "}
                <Link href={`/dashboard/facturacion/${factura.id}/editar`} className="font-medium text-teal underline">
                  Ajústala primero
                </Link>
                .
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <select className="vc-input flex-1" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
              {METODOS_PAGO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {/* Fecha del pago, al lado del método (2 sept 2026) — ver
                comentario en el useState de fechaPago. width:auto por el
                mismo bug de vc-input al 100% dentro de un flex row. */}
            <input
              type="date"
              className="vc-input flex-shrink-0"
              style={{ width: "auto" }}
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
            />
            {/* .vc-btn-primary trae width:100% en globals.css — en este flex
                row eso gana como flex-basis y aplasta el <select> flex-1 al
                lado (mismo bug de fondo documentado en varios lugares). */}
            <button className="vc-btn-primary flex-shrink-0" style={{ width: "auto" }} disabled={loading} onClick={marcarPagada}>
              {loading ? "..." : "Está correcto"}
            </button>
            <button className="flex-shrink-0 text-xs text-muted hover:opacity-80" onClick={() => setPagando(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, valor, sub, tono }: { label: string; valor: string; sub: string; tono?: "g" | "a" | "r" }) {
  const color = tono === "g" ? "var(--teal)" : tono === "a" ? "#F5A623" : tono === "r" ? "var(--red)" : undefined;
  return (
    <div className="vc-card !p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-medium" style={color ? { color } : undefined}>
        {valor}
      </p>
      <p className="text-[11px]" style={color ? { color } : { color: "var(--muted)" }}>
        {sub}
      </p>
    </div>
  );
}

// Ver nota junto a feeProcesamiento: "ATH Móvil" = transferencia personal
// (sin fee), "ATH Móvil Business" = cobrado por el pATH (con fee).
const METODOS_PAGO = ["ATH Móvil", "ATH Móvil Business", "Transferencia", "Cheque", "Efectivo", "Tarjeta", "Otro"];

function ClientesTab({ clients }: { clients: Cliente[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");

  // "todos"/"negocio"/"individual" solo miran clientes ACTIVOS — igual que
  // antes de este cambio. "archivados" es la excepción: es el único valor
  // que muestra los que tienen active=false (1 sept 2026, pedido de Joel:
  // "no se dnd verlos" — antes el portal ni siquiera traía los archivados
  // de la base de datos, así que no había forma de verlos desde aquí sin
  // salirse a /dashboard/clientes).
  const filtrados = useMemo(() => {
    return clients.filter((c) => {
      if (filtro === "archivados") return !c.active;
      if (!c.active) return false;
      if (filtro === "negocio" && !c.es_negocio) return false;
      if (filtro === "individual" && c.es_negocio) return false;
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        const nombre = c.name.toLowerCase();
        const email = c.email?.toLowerCase() ?? "";
        if (!nombre.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [clients, filtro, busqueda]);

  const totalActivos = useMemo(() => clients.filter((c) => c.active).length, [clients]);

  return (
    <>
      <div className="mb-3 flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-teal" />
          <input
            className="vc-input w-full min-w-0"
            style={{ paddingLeft: 32 }}
            placeholder="Buscar cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select
          className="vc-input flex-shrink-0 px-1.5"
          style={{ width: 100 }}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="todos">Todos</option>
          <option value="negocio">Retención</option>
          <option value="individual">Individual</option>
          <option value="archivados">Archivados</option>
        </select>
      </div>

      <div className="vc-card">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted">
            Directorio{filtro === "archivados" ? " (archivados)" : ""}{" "}
            <span className="normal-case text-muted">
              · {filtro === "archivados" ? filtrados.length : totalActivos} cliente{(filtro === "archivados" ? filtrados.length : totalActivos) === 1 ? "" : "s"}
            </span>
          </p>
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/clientes/importar?returnTo=${RETURN_TO_TAB_CLIENTES}`}
              className="text-xs font-medium text-muted hover:text-teal"
            >
              Importar CSV
            </Link>
            <Link
              href={`/dashboard/clientes/nuevo?returnTo=${RETURN_TO_TAB_CLIENTES}`}
              className="text-xs font-medium text-teal hover:opacity-80"
            >
              + Nuevo cliente
            </Link>
          </div>
        </div>

      {clients.length === 0 && (
        <p className="text-xs text-muted">Todavía no tienes clientes. Dale a "+ Nuevo cliente" arriba para crear el primero.</p>
      )}
      {clients.length > 0 && filtrados.length === 0 && (
        <p className="text-xs text-muted">No hay clientes que coincidan con la búsqueda.</p>
      )}

      {filtrados.map((c) => (
        <div key={c.id} className="flex items-center gap-2.5 border-b border-border py-2.5 text-sm last:border-0">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
            style={{ background: colorAvatar(c.id) }}
          >
            {iniciales(c.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate">{c.name}</p>
            {c.email && <p className="truncate text-xs text-muted">{c.email}</p>}
          </div>
          {c.es_negocio ? (
            <span className="flex-shrink-0 rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal">
              Retención {Number(c.retention_pct)}%
            </span>
          ) : (
            <span className="flex-shrink-0 text-xs text-muted">Individual</span>
          )}
          <Link
            href={`/dashboard/clientes/${c.id}/editar?returnTo=${RETURN_TO_TAB_CLIENTES}`}
            className="flex-shrink-0 text-muted hover:text-teal"
            title="Editar cliente"
          >
            <i className="ti ti-edit" style={{ fontSize: 15 }} />
          </Link>
        </div>
      ))}
      </div>
    </>
  );
}

const TIPOS_SERVICIO = [
  { value: "fijo", label: "Precio fijo", sufijo: "" },
  { value: "hora", label: "Por hora", sufijo: "/hora" },
  { value: "proyecto", label: "Por proyecto", sufijo: "/proyecto" },
  { value: "recurrente", label: "Recurrente", sufijo: "/mes" },
] as const;

function labelTipo(tipo: string): string {
  return TIPOS_SERVICIO.find((t) => t.value === tipo)?.label ?? tipo;
}

function sufijoTipo(tipo: string): string {
  return TIPOS_SERVICIO.find((t) => t.value === tipo)?.sufijo ?? "";
}

function ServiciosTab({ servicios, entidadId }: { servicios: Servicio[]; entidadId: string | null }) {
  const supabase = createClient();
  const [lista, setLista] = useState(servicios);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [formAbierto, setFormAbierto] = useState<"nuevo" | string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS_SERVICIO)[number]["value"]>("fijo");
  const [precio, setPrecio] = useState("");
  // Default cambiado a "sí aplica IVU" (false = no exento) — pedido de
  // Joel (1 sept 2026): la mayoría de servicios sí cobran IVU, la exención
  // es la excepción, no la regla. Antes cualquier servicio nuevo salía
  // exento por default aunque la entidad tuviera IVU activo.
  const [ivuExento, setIvuExento] = useState(false);

  function abrirNuevo() {
    setFormAbierto("nuevo");
    setNombre("");
    setDescripcion("");
    setTipo("fijo");
    setPrecio("");
    setIvuExento(true);
    setError(null);
  }

  function abrirEditar(s: Servicio) {
    setFormAbierto(s.id);
    setNombre(s.nombre);
    setDescripcion(s.descripcion ?? "");
    setTipo(s.tipo as (typeof TIPOS_SERVICIO)[number]["value"]);
    setPrecio(String(s.precio));
    setIvuExento(s.ivu_exento);
    setError(null);
  }

  async function guardar() {
    if (!nombre.trim() || !precio) return;
    setGuardando(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada — vuelve a entrar.");
      setGuardando(false);
      return;
    }

    if (formAbierto === "nuevo") {
      const { data, error: insertError } = await supabase
        .from("services")
        .insert({
          owner_id: user.id,
          entity_id: entidadId,
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          tipo,
          precio: Number(precio),
          ivu_exento: ivuExento,
        })
        .select("id, nombre, descripcion, tipo, precio, ivu_exento, activo, entity_id")
        .single();
      setGuardando(false);
      if (insertError || !data) {
        setError(insertError?.message ?? "No se pudo guardar.");
        return;
      }
      setLista((prev) => [data as Servicio, ...prev]);
      setFormAbierto(null);
    } else if (formAbierto) {
      const { error: updateError } = await supabase
        .from("services")
        .update({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, tipo, precio: Number(precio), ivu_exento: ivuExento })
        .eq("id", formAbierto);
      setGuardando(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setLista((prev) =>
        prev.map((s) =>
          s.id === formAbierto
            ? { ...s, nombre: nombre.trim(), descripcion: descripcion.trim() || null, tipo, precio: Number(precio), ivu_exento: ivuExento }
            : s
        )
      );
      setFormAbierto(null);
    }
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este servicio del catálogo?")) return;
    const { error: deleteError } = await supabase.from("services").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setLista((prev) => prev.filter((s) => s.id !== id));
    if (formAbierto === id) setFormAbierto(null);
  }

  const filtrados = useMemo(() => {
    return lista.filter((s) => {
      if (filtroTipo && s.tipo !== filtroTipo) return false;
      if (busqueda.trim() && !s.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false;
      return true;
    });
  }, [lista, filtroTipo, busqueda]);

  return (
    <>
      <div className="mb-3 flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-teal" />
          <input
            className="vc-input w-full min-w-0"
            style={{ paddingLeft: 32 }}
            placeholder="Buscar servicio..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select
          className="vc-input flex-shrink-0 px-1.5"
          style={{ width: 110 }}
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
        >
          <option value="">Todos</option>
          {TIPOS_SERVICIO.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          onClick={abrirNuevo}
          className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2.5 text-xs font-medium text-white hover:opacity-90"
          style={{ background: "#1D9E75", width: "auto" }}
        >
          <i className="ti ti-plus" /> Nuevo
        </button>
      </div>

      {formAbierto && (
        <div className="vc-card mb-3 flex flex-col gap-2.5">
          <p className="text-xs uppercase tracking-wide text-muted">
            {formAbierto === "nuevo" ? "Nuevo servicio" : "Editar servicio"}
          </p>
          {error && <p className="text-xs text-red">{error}</p>}
          <input className="vc-input" placeholder="Nombre del servicio" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <input
            className="vc-input"
            placeholder="Descripción (opcional)"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
          <div className="flex gap-2">
            <select className="vc-input flex-1" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
              {TIPOS_SERVICIO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              className="vc-input w-28 flex-shrink-0"
              type="number"
              step="0.01"
              min="0"
              placeholder="Precio"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={ivuExento} onChange={(e) => setIvuExento(e.target.checked)} />
            No aplica IVU (servicio profesional)
          </label>
          <div className="flex gap-2">
            <button className="vc-btn-primary flex-1" disabled={!nombre || !precio || guardando} onClick={guardar}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button className="flex-shrink-0 px-3 text-xs text-muted hover:opacity-80" onClick={() => setFormAbierto(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
          Catálogo <span className="normal-case text-muted">· {lista.length} servicio{lista.length === 1 ? "" : "s"}</span>
        </p>

        {lista.length === 0 && (
          <p className="text-xs text-muted">Todavía no tienes servicios guardados. Dale a "+ Nuevo" arriba para crear el primero.</p>
        )}
        {lista.length > 0 && filtrados.length === 0 && <p className="text-xs text-muted">No hay servicios que coincidan.</p>}

        {filtrados.map((s) => (
          <div key={s.id} className="border-b border-border py-2.5 text-sm last:border-0">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white"
                style={{ background: colorAvatar(s.id) }}
              >
                <i className="ti ti-package" style={{ fontSize: 16 }} />
              </div>
              <button className="min-w-0 flex-1 text-left" onClick={() => abrirEditar(s)}>
                <p className="truncate">{s.nombre}</p>
                {s.descripcion && <p className="truncate text-xs text-muted">{s.descripcion}</p>}
                <p className="truncate text-xs text-muted">
                  {labelTipo(s.tipo)} · {s.ivu_exento ? "No aplica IVU" : "Aplica IVU"}
                </p>
              </button>
              <div className="flex flex-shrink-0 items-center gap-2">
                <span className="font-medium">
                  {formatMoney(Number(s.precio))}
                  <span className="text-xs font-normal text-muted">{sufijoTipo(s.tipo)}</span>
                </span>
                <button onClick={() => abrirEditar(s)} className="text-muted hover:text-teal">
                  <i className="ti ti-edit" style={{ fontSize: 15 }} />
                </button>
                <button onClick={() => eliminar(s.id)} className="text-muted hover:text-red">
                  <i className="ti ti-trash" style={{ fontSize: 15 }} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const ESTILOS_BADGE_COT: Record<string, string> = {
  enviada: "bg-teal/10 text-teal",
  aprobada: "bg-teal text-white",
  rechazada: "bg-red/10 text-red",
  convertida: "bg-border text-muted",
};

const ETIQUETAS_BADGE_COT: Record<string, string> = {
  enviada: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  convertida: "Convertida",
};

function CotizacionesTab({ cotizaciones }: { cotizaciones: Cotizacion[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todas");

  const pendientes = cotizaciones.filter((c) => c.estado === "enviada");
  const aprobadas = cotizaciones.filter((c) => c.estado === "aprobada" || c.estado === "convertida");
  const rechazadas = cotizaciones.filter((c) => c.estado === "rechazada");
  const pctAprobadas = cotizaciones.length > 0 ? Math.round((aprobadas.length / cotizaciones.length) * 100) : 0;
  const totalPendiente = pendientes.reduce((s, c) => s + Number(c.total), 0);

  const filtradas = useMemo(() => {
    return cotizaciones.filter((c) => {
      if (filtro !== "todas" && c.estado !== filtro) return false;
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        const nombre = c.clients?.name?.toLowerCase() ?? "";
        if (!nombre.includes(q) && !c.numero.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [cotizaciones, filtro, busqueda]);

  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <StatCard label="Pendientes" valor={String(pendientes.length)} sub={formatMoney(totalPendiente)} tono="a" />
        <StatCard label="Aprobadas" valor={String(aprobadas.length)} sub={`${pctAprobadas}%`} tono="g" />
        <StatCard label="Rechazadas" valor={String(rechazadas.length)} sub="" tono="r" />
      </div>

      <div className="mb-3 flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-teal" />
          <input
            className="vc-input w-full min-w-0"
            style={{ paddingLeft: 32 }}
            placeholder="Buscar..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select
          className="vc-input flex-shrink-0 px-1.5"
          style={{ width: 92 }}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="todas">Todas</option>
          <option value="enviada">Pendientes</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="convertida">Convertidas</option>
        </select>
        <Link
          href="/dashboard/facturacion/cotizaciones/nueva"
          className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2.5 text-xs font-medium text-white hover:opacity-90"
          style={{ background: "#1D9E75", width: "auto" }}
        >
          <i className="ti ti-plus" /> Nueva
        </Link>
      </div>

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Todas las cotizaciones</p>
        {filtradas.length === 0 && <p className="text-xs text-muted">No hay cotizaciones que coincidan.</p>}
        {filtradas.map((c) => {
          const nombre = c.clients?.name ?? "Sin cliente";
          return (
            <Link
              key={c.id}
              href={`/dashboard/facturacion/cotizaciones/${c.id}`}
              className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-0"
            >
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                style={{ background: colorAvatar(c.client_id ?? c.id) }}
              >
                {iniciales(nombre)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{nombre}</p>
                <p className="truncate text-xs text-muted">
                  #{c.numero} · {formatFecha(c.fecha_emision)}
                </p>
              </div>
              <div className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-medium">{formatMoney(Number(c.total))}</span>
                <span className={`rounded px-2 py-1 text-xs font-medium ${ESTILOS_BADGE_COT[c.estado] ?? "bg-border text-muted"}`}>
                  {ETIQUETAS_BADGE_COT[c.estado] ?? c.estado}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

// Reconstruido el 2 sept 2026 calcando la sección "Reportes" del mockup
// VICTOR Pro — Producto Completo_FINAL.html (id="pf-rep"): filtros de
// período + filtros avanzados (cliente/servicio/categoría/estado/email) +
// selector de "vista" que decide qué tarjeta se muestra debajo, más
// exportar CSV/PDF. Se deja fuera la tarjeta "Retenciones para Hacienda"
// (lo que Joel le retiene a SUS contratistas, Ley 480.6) porque depende del
// módulo Pagos, que todavía no existe — se añade cuando se construya. La
// tarjeta "Créditos en Hacienda" del mockup separaba Acreditado/Pendiente;
// aquí se deja solo el total porque el sistema no rastrea si Joel ya
// reclamó la retención en su planilla (decisión de Joel, 2 sept 2026).
const PERIODOS = [
  { value: "mes", label: "Este mes" },
  { value: "trimestre", label: "Trimestre" },
  { value: "anio", label: "Este año" },
  { value: "todo", label: "Todo" },
  { value: "rango", label: "Rango" },
] as const;

function inicioPeriodo(periodo: string, rangoDesde: string): string {
  const hoy = new Date();
  if (periodo === "mes") return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  if (periodo === "trimestre") {
    const inicioTrimestre = Math.floor(hoy.getMonth() / 3) * 3;
    return new Date(hoy.getFullYear(), inicioTrimestre, 1).toISOString().slice(0, 10);
  }
  if (periodo === "anio") return new Date(hoy.getFullYear(), 0, 1).toISOString().slice(0, 10);
  if (periodo === "rango") return rangoDesde || "0000-01-01";
  return "0000-01-01";
}

function finPeriodo(periodo: string, rangoHasta: string): string {
  if (periodo === "rango") return rangoHasta || hoyISO();
  return hoyISO();
}

const VISTAS = [
  { value: "cliente", label: "Por cliente" },
  { value: "servicio", label: "Por servicio" },
  { value: "categoria", label: "Por categoría" },
  { value: "clienteServicio", label: "Cliente + servicio" },
  { value: "retenciones", label: "Retenciones SURI" },
  { value: "flujo", label: "Flujo de cobro" },
] as const;
type VistaReporte = (typeof VISTAS)[number]["value"];

const ESTADOS_REPORTE = [
  { value: "pagada", label: "Pagadas" },
  { value: "enviada", label: "Pendientes" },
  { value: "vencida", label: "Vencidas" },
] as const;

function mesLabel(yyyyMm: string): string {
  const [anio, mes] = yyyyMm.split("-").map(Number);
  if (!anio || !mes) return yyyyMm;
  const fecha = new Date(anio, mes - 1, 1);
  return fecha.toLocaleDateString("es-PR", { month: "short", year: "numeric" });
}

function SeccionColapsable({
  titulo,
  accionDerecha,
  defaultAbierta = true,
  children,
}: {
  titulo: string;
  accionDerecha?: React.ReactNode;
  defaultAbierta?: boolean;
  children: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(defaultAbierta);
  return (
    <div className="vc-card mb-3">
      <button type="button" className="flex w-full items-center justify-between" onClick={() => setAbierta((v) => !v)}>
        <p className="text-xs uppercase tracking-wide text-muted">{titulo}</p>
        <span className="flex items-center gap-2">
          {accionDerecha}
          <i className={`ti ${abierta ? "ti-minus" : "ti-plus"} text-muted`} style={{ fontSize: 13 }} />
        </span>
      </button>
      {abierta && <div className="mt-2">{children}</div>}
    </div>
  );
}

function FilaResumen({ label, valor, tono, fuerte }: { label: string; valor: string; tono?: "g" | "a" | "r"; fuerte?: boolean }) {
  const color = tono === "g" ? "var(--teal)" : tono === "a" ? "#F5A623" : tono === "r" ? "var(--red)" : undefined;
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${fuerte ? "mt-1 border-t border-border pt-2 font-medium" : ""}`}>
      <span className="text-muted">{label}</span>
      <span className="font-medium" style={color ? { color } : undefined}>
        {valor}
      </span>
    </div>
  );
}

function BarraProgreso({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden", marginTop: 5 }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

// Combobox con búsqueda + fila fija "Todos" arriba (2 sept 2026, pedido de
// Joel: con muchos clientes/servicios un <select> nativo se vuelve
// incómodo — calca el patrón SelectorBuscable ya usado en Nueva Factura,
// pero como aquí el filtro también tiene un valor "vacío" = todos, esa
// opción se deja fija arriba del resultado de la búsqueda en vez de ser
// solo el primer <option>).
function ComboBuscable<T extends { id: string }>({
  items,
  valorId,
  onSeleccionar,
  etiqueta,
  etiquetaTodos,
  placeholder,
}: {
  items: T[];
  valorId: string;
  onSeleccionar: (id: string) => void;
  etiqueta: (item: T) => string;
  etiquetaTodos: string;
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
        style={{ fontSize: 12 }}
        placeholder={placeholder}
        value={abierto ? busqueda : seleccionado ? etiqueta(seleccionado) : etiquetaTodos}
        onFocus={() => {
          setAbierto(true);
          setBusqueda("");
        }}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      {abierto && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          <button
            type="button"
            className="block w-full border-b border-border px-3 py-2 text-left text-sm font-medium text-teal hover:bg-bg"
            onClick={() => {
              onSeleccionar("");
              setAbierto(false);
              setBusqueda("");
            }}
          >
            {etiquetaTodos}
          </button>
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

type ItemFacturado = {
  facturaId: string;
  descripcion: string;
  serviceId: string | null;
  servicioNombre: string | null;
  servicioTipo: string | null;
  subtotal_linea: number;
  estado: string;
  fecha_emision: string;
  clientId: string | null;
  clientNombre: string;
  clientEmail: string | null;
};

function ReportesTab({
  facturas,
  clients,
  servicios,
  entidadId,
  entidadesConAth,
}: {
  facturas: Factura[];
  clients: Cliente[];
  servicios: Servicio[];
  entidadId: string | null;
  entidadesConAth: Set<string>;
}) {
  const supabase = createClient();
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["value"]>("mes");
  const [rangoDesde, setRangoDesde] = useState(hoyISO());
  const [rangoHasta, setRangoHasta] = useState(hoyISO());
  // panelAbierto (2 sept 2026, pedido de Joel: "todo lo que se pueda abrir
  // con un click debe cerrarse con otro click") — clic en el período YA
  // activo alterna abierto/cerrado; clic en otro período cambia y abre.
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [itemsFacturados, setItemsFacturados] = useState<ItemFacturado[] | null>(null);

  // Filtros avanzados: "draft" es lo que el usuario está tecleando/eligiendo,
  // "filtros" es lo que realmente se aplica al cálculo — solo se sincronizan
  // al darle a "Aplicar filtros" (calcado del botón del mockup), así una
  // búsqueda de email no recalcula todo con cada letra. "vista" es la
  // excepción: cambia la tarjeta de abajo al instante, es solo presentación.
  const [draftCliente, setDraftCliente] = useState("");
  const [draftServicio, setDraftServicio] = useState("");
  const [draftCategoria, setDraftCategoria] = useState("");
  const [draftEstado, setDraftEstado] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [vista, setVista] = useState<VistaReporte>("cliente");
  const [filtros, setFiltros] = useState({ cliente: "", servicio: "", categoria: "", estado: "", email: "" });

  function aplicarFiltros() {
    setFiltros({ cliente: draftCliente, servicio: draftServicio, categoria: draftCategoria, estado: draftEstado, email: draftEmail });
  }
  function limpiarFiltros() {
    setDraftCliente("");
    setDraftServicio("");
    setDraftCategoria("");
    setDraftEstado("");
    setDraftEmail("");
    setFiltros({ cliente: "", servicio: "", categoria: "", estado: "", email: "" });
  }

  useEffect(() => {
    let activo = true;
    supabase
      // service_id (1 sept 2026) — referencia real al catálogo, para
      // agrupar "Ingresos por servicio" por producto de verdad y no por
      // el texto exacto de la descripción (ver migración 0044). Se trae
      // el nombre ACTUAL del servicio (services.nombre) para el label,
      // en vez del texto guardado en la línea, así una línea vieja sigue
      // agrupando bien aunque el catálogo se haya renombrado después.
      // invoice_id + client_id/email (2 sept 2026) — hacen falta para que
      // los filtros avanzados de Reportes (cliente, email, estado real
      // incluyendo "vencida") puedan cruzar cada línea con su factura.
      .from("invoice_items")
      .select(
        "invoice_id, descripcion, service_id, subtotal_linea, cantidad, precio_unitario, services(nombre, tipo), invoices(estado, fecha_emision, client_id, clients(name, email))"
      )
      .then(({ data }) => {
        if (!activo) return;
        const filas: ItemFacturado[] = (data ?? []).map((it: any) => ({
          facturaId: it.invoice_id as string,
          descripcion: it.descripcion as string,
          serviceId: it.service_id ?? null,
          servicioNombre: it.services?.nombre ?? null,
          servicioTipo: it.services?.tipo ?? null,
          subtotal_linea: Number(it.subtotal_linea ?? it.cantidad * it.precio_unitario),
          estado: it.invoices?.estado ?? "borrador",
          fecha_emision: it.invoices?.fecha_emision ?? "",
          clientId: it.invoices?.client_id ?? null,
          clientNombre: it.invoices?.clients?.name ?? "Sin cliente",
          clientEmail: it.invoices?.clients?.email ?? null,
        }));
        setItemsFacturados(filas);
      });
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const desde = periodo === "rango" ? inicioPeriodo(periodo, rangoDesde) : inicioPeriodo(periodo, "");
  const hasta = finPeriodo(periodo, rangoHasta);

  const clientePorId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const facturaPorId = useMemo(() => new Map(facturas.map((f) => [f.id, f])), [facturas]);

  const itemsEnRango = useMemo(() => {
    if (!itemsFacturados) return [];
    return itemsFacturados.filter((it) => {
      if (it.estado === "borrador") return false;
      if (it.fecha_emision < desde || it.fecha_emision > hasta) return false;
      if (filtros.cliente && it.clientId !== filtros.cliente) return false;
      if (filtros.servicio && it.serviceId !== filtros.servicio) return false;
      if (filtros.categoria && it.servicioTipo !== filtros.categoria) return false;
      if (filtros.email && !(it.clientEmail ?? "").toLowerCase().includes(filtros.email.toLowerCase())) return false;
      if (filtros.estado) {
        const f = facturaPorId.get(it.facturaId);
        if (!f || estadoMostrado(f) !== filtros.estado) return false;
      }
      return true;
    });
  }, [itemsFacturados, desde, hasta, filtros, facturaPorId]);

  // Cuando hay filtro de servicio/categoría, las facturas se restringen a
  // las que tengan al menos una línea que pase ese filtro — así "Resumen" y
  // "Por cliente" no muestran facturas que no tocan el servicio elegido.
  const idsDesdeItems = useMemo(() => {
    if (!filtros.servicio && !filtros.categoria) return null;
    return new Set(itemsEnRango.map((it) => it.facturaId));
  }, [itemsEnRango, filtros.servicio, filtros.categoria]);

  const facturasFiltradas = useMemo(() => {
    return facturas.filter((f) => {
      if (f.estado === "borrador") return false;
      if (f.fecha_emision < desde || f.fecha_emision > hasta) return false;
      if (filtros.cliente && f.client_id !== filtros.cliente) return false;
      if (filtros.estado && estadoMostrado(f) !== filtros.estado) return false;
      if (filtros.email) {
        const email = (f.client_id ? clientePorId.get(f.client_id)?.email : null) ?? "";
        if (!email.toLowerCase().includes(filtros.email.toLowerCase())) return false;
      }
      if (idsDesdeItems && !idsDesdeItems.has(f.id)) return false;
      return true;
    });
  }, [facturas, desde, hasta, filtros, idsDesdeItems, clientePorId]);

  // "Facturado" = Ingreso Bruto / Ventas Brutas real (subtotal, ANTES de
  // retención) — no invoices.total, que ya viene neto de retención (ver
  // nota junto a feeProcesamiento). Corrección pedida por Joel (2 sept
  // 2026, con desglose contable): "el reporte de ventas/servicios prestados
  // DEBE reflejar $100,000.00... ni la retención ni las comisiones de ATH
  // reducen tus ventas brutas o lo que facturaste, reducen únicamente tu
  // efectivo recibido en banco". invoices.total sigue siendo correcto para
  // todo lo demás (es lo que el cliente debe pagar/pagó); solo "Facturado"
  // como métrica de ingreso bruto necesitaba usar subtotal.
  const totalFacturado = facturasFiltradas.reduce((s, f) => s + Number(f.subtotal), 0);
  const facturasPagadas = useMemo(() => facturasFiltradas.filter((f) => f.estado === "pagada"), [facturasFiltradas]);
  const totalCobrado = facturasPagadas.reduce((s, f) => s + Number(f.total), 0);
  const totalPendiente = facturasFiltradas.filter((f) => f.estado !== "pagada").reduce((s, f) => s + Number(f.total), 0);
  const tasaCobro = totalFacturado > 0 ? Math.round((totalCobrado / totalFacturado) * 100) : 0;

  const porCliente = useMemo(() => {
    const mapa = new Map<string, { id: string; nombre: string; facturado: number; cobrado: number; count: number }>();
    for (const f of facturasFiltradas) {
      const key = f.client_id ?? "sin-cliente";
      const nombre = f.clients?.name ?? "Sin cliente";
      const actual = mapa.get(key) ?? { id: key, nombre, facturado: 0, cobrado: 0, count: 0 };
      actual.facturado += Number(f.subtotal);
      if (f.estado === "pagada") actual.cobrado += Number(f.total);
      actual.count += 1;
      mapa.set(key, actual);
    }
    return [...mapa.values()].sort((a, b) => b.facturado - a.facturado);
  }, [facturasFiltradas]);
  const maxPorCliente = Math.max(1, ...porCliente.map((c) => c.facturado));

  // Retenciones acumuladas (1 sept 2026) — pote visual pedido por Joel:
  // cuando un cliente-negocio retiene (Sección 1062.03), esa plata la
  // deposita ÉL a Hacienda a nombre de Joel, no Joel — así que solo cuenta
  // como "crédito real" cuando la factura ya está pagada (antes de eso la
  // retención todavía no ocurrió). Se agrupa por cliente para que Joel
  // pueda cuadrar cada uno contra lo que SURI le muestre al declarar, y
  // detectar si alguno no ha estado depositando lo que le retiene.
  const porRetencion = useMemo(() => {
    const mapa = new Map<string, { nombre: string; retenido: number; facturado: number; pct: number; count: number }>();
    for (const f of facturasFiltradas) {
      if (f.estado !== "pagada") continue;
      const monto = Number(f.retencion_monto || 0);
      if (monto <= 0) continue;
      const key = f.client_id ?? "sin-cliente";
      const nombre = f.clients?.name ?? "Sin cliente";
      const actual = mapa.get(key) ?? { nombre, retenido: 0, facturado: 0, pct: Number(f.retencion_pct || 0), count: 0 };
      actual.retenido += monto;
      actual.facturado += Number(f.total) + monto;
      actual.count += 1;
      mapa.set(key, actual);
    }
    return [...mapa.values()].sort((a, b) => b.retenido - a.retenido);
  }, [facturasFiltradas]);
  const totalRetenido = porRetencion.reduce((s, c) => s + c.retenido, 0);

  // Gasto de procesamiento de pagos del período (2 sept 2026, pedido de
  // Joel) — mismo cálculo que en FacturasTab, pero acotado a las facturas
  // del período/filtros activos de Reportes, para que cuadre con lo que
  // esté viendo en pantalla al declarar.
  const gastoProcesamientoPeriodo = facturasFiltradas.reduce(
    (s, f) => (f.estado === "pagada" ? s + feeProcesamiento(f, entidadesConAth) : s),
    0
  );

  // Cascada de conciliación (2 sept 2026, pedido de Joel con desglose
  // contable de experto): Facturación Bruta → Retenciones → Recaudado →
  // Comisiones → Depósito neto en banco. A diferencia de "Facturado" de
  // arriba (que incluye TODO el período, pagado o no), esta cascada solo
  // usa las facturas YA PAGADAS — es una conciliación de efectivo real, no
  // una proyección, así que solo tiene sentido sobre lo que de verdad
  // entró. brutoCobrado = subtotal de las pagadas (antes de cualquier
  // descuento); totalRetenido ya viene de porRetencion (solo pagadas);
  // totalCobrado ya es bruto-retención (invoices.total); depositoNeto le
  // resta el fee de procesamiento real.
  const brutoCobrado = facturasPagadas.reduce((s, f) => s + Number(f.subtotal), 0);
  const depositoNetoBanco = totalCobrado - gastoProcesamientoPeriodo;

  const porServicio = useMemo(() => {
    const mapa = new Map<string, { descripcion: string; total: number; count: number }>();
    for (const it of itemsEnRango) {
      // Agrupa por service_id cuando existe (línea real del catálogo) —
      // así "Consulta inicial" y "consulta Inicial" cuentan como el mismo
      // producto. Las líneas libres (sin catálogo) siguen agrupando por
      // su texto exacto, que es lo único que tienen.
      const key = it.serviceId ?? `desc:${it.descripcion}`;
      const nombre = it.servicioNombre ?? it.descripcion;
      const actual = mapa.get(key) ?? { descripcion: nombre, total: 0, count: 0 };
      actual.total += it.subtotal_linea;
      actual.count += 1;
      mapa.set(key, actual);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [itemsEnRango]);
  const maxPorServicio = Math.max(1, ...porServicio.map((s) => s.total));

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, { tipo: string; total: number; count: number }>();
    for (const it of itemsEnRango) {
      const key = it.servicioTipo ?? "sin-categoria";
      const actual = mapa.get(key) ?? { tipo: key, total: 0, count: 0 };
      actual.total += it.subtotal_linea;
      actual.count += 1;
      mapa.set(key, actual);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [itemsEnRango]);
  const maxPorCategoria = Math.max(1, ...porCategoria.map((c) => c.total));

  const porClienteServicio = useMemo(() => {
    const mapa = new Map<string, { cliente: string; servicio: string; total: number; count: number }>();
    for (const it of itemsEnRango) {
      const key = `${it.clientId ?? "sin-cliente"}::${it.serviceId ?? it.descripcion}`;
      const actual = mapa.get(key) ?? { cliente: it.clientNombre, servicio: it.servicioNombre ?? it.descripcion, total: 0, count: 0 };
      actual.total += it.subtotal_linea;
      actual.count += 1;
      mapa.set(key, actual);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [itemsEnRango]);

  const porMes = useMemo(() => {
    const mapa = new Map<string, { mes: string; facturado: number; cobrado: number }>();
    for (const f of facturasFiltradas) {
      const mes = f.fecha_emision.slice(0, 7);
      const actual = mapa.get(mes) ?? { mes, facturado: 0, cobrado: 0 };
      actual.facturado += Number(f.subtotal);
      mapa.set(mes, actual);
    }
    // "Cobrado" se agrupa por el mes real del pago (fecha_pago), no por el
    // mes de emisión (2 sept 2026, pedido de Joel: una factura emitida el
    // día 1 pero pagada el día 2 del mes siguiente salía "cobrada" en el
    // mes equivocado). Puede caer en un mes que no tenga nada facturado —
    // por eso se crea la fila si hace falta, en vez de asumir que ya existe.
    // Facturas pagadas antes de que existiera fecha_pago no la tienen; para
    // esas se usa fecha_emision como respaldo (mismo comportamiento de antes).
    for (const f of facturasFiltradas) {
      if (f.estado !== "pagada") continue;
      const mesCobro = (f.fecha_pago ?? f.fecha_emision).slice(0, 7);
      const actual = mapa.get(mesCobro) ?? { mes: mesCobro, facturado: 0, cobrado: 0 };
      actual.cobrado += Number(f.total);
      mapa.set(mesCobro, actual);
    }
    return [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }, [facturasFiltradas]);

  const paramsExport = useMemo(() => {
    const p = new URLSearchParams();
    p.set("desde", desde);
    p.set("hasta", hasta);
    if (filtros.cliente) p.set("clienteId", filtros.cliente);
    if (filtros.servicio) p.set("servicioId", filtros.servicio);
    if (filtros.categoria) p.set("categoria", filtros.categoria);
    if (filtros.estado) p.set("estado", filtros.estado);
    if (filtros.email) p.set("email", filtros.email);
    if (entidadId) p.set("entityId", entidadId);
    p.set("vista", vista);
    return p.toString();
  }, [desde, hasta, filtros, entidadId, vista]);
  const csvHref = `/api/facturas/reportes/csv?${paramsExport}`;
  const pdfHref = `/api/facturas/reportes/pdf?${paramsExport}`;

  return (
    <>
      {/* Botones + lo que se despliega viven dentro de UN mismo contenedor
          con borde/fondo teal, para que "Rango" se vea visualmente pegado a
          las fechas que abren debajo (pedido de Joel, 2 sept 2026:
          "delimitar con color lo que abre abajo"). La flechita marca cuál
          botón es el que tiene algo desplegable. */}
      <div className="mb-3 rounded-xl border border-teal/30 bg-teal/[.05] p-2">
        <div className="flex gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                if (periodo === p.value) {
                  setPanelAbierto((a) => !a);
                } else {
                  setPeriodo(p.value);
                  setPanelAbierto(true);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium"
              style={
                periodo === p.value
                  ? { background: "#1D9E75", color: "#fff" }
                  : { background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }
              }
            >
              {p.label}
              {p.value === "rango" && (
                <i
                  className="ti ti-chevron-down"
                  style={{ fontSize: 12, transform: periodo === p.value && panelAbierto ? "rotate(180deg)" : "none", transition: "transform .15s" }}
                />
              )}
            </button>
          ))}
        </div>

        {periodo === "rango" && panelAbierto && (
          <div className="mt-2 flex gap-1.5 border-t border-teal/20 pt-2">
            <input type="date" className="vc-input flex-1" value={rangoDesde} onChange={(e) => setRangoDesde(e.target.value)} />
            <input type="date" className="vc-input flex-1" value={rangoHasta} onChange={(e) => setRangoHasta(e.target.value)} />
          </div>
        )}
      </div>

      <div className="vc-card mb-3">
        <p className="mb-2.5 text-xs uppercase tracking-wide text-muted">Filtrar por</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cliente">
            <ComboBuscable
              items={clients}
              valorId={draftCliente}
              onSeleccionar={setDraftCliente}
              etiqueta={(c) => c.name}
              etiquetaTodos="Todos los clientes"
              placeholder="Buscar cliente..."
            />
          </Field>
          <Field label="Servicio">
            <ComboBuscable
              items={servicios}
              valorId={draftServicio}
              onSeleccionar={setDraftServicio}
              etiqueta={(s) => s.nombre}
              etiquetaTodos="Todos los servicios"
              placeholder="Buscar servicio..."
            />
          </Field>
          <Field label="Categoría">
            <select className="vc-input" style={{ fontSize: 12 }} value={draftCategoria} onChange={(e) => setDraftCategoria(e.target.value)}>
              <option value="">Todas las categorías</option>
              {TIPOS_SERVICIO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado">
            <select className="vc-input" style={{ fontSize: 12 }} value={draftEstado} onChange={(e) => setDraftEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {ESTADOS_REPORTE.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Email cliente">
              <input
                className="vc-input"
                style={{ fontSize: 12 }}
                placeholder="Buscar por email..."
                value={draftEmail}
                onChange={(e) => setDraftEmail(e.target.value)}
              />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Vista del reporte">
              <select className="vc-input" style={{ fontSize: 12 }} value={vista} onChange={(e) => setVista(e.target.value as VistaReporte)}>
                {VISTAS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <div className="mt-2.5 flex gap-2">
          <button className="vc-btn-primary flex-1" onClick={aplicarFiltros}>
            <i className="ti ti-search" /> Aplicar filtros
          </button>
          <button
            className="flex-shrink-0 rounded-lg border border-border px-3 text-xs text-muted hover:opacity-80"
            style={{ width: "auto" }}
            onClick={limpiarFiltros}
          >
            Limpiar
          </button>
          <a
            href={csvHref}
            className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-teal px-3 text-xs font-medium text-teal hover:opacity-80"
          >
            <i className="ti ti-download" /> CSV
          </a>
        </div>
      </div>

      <SeccionColapsable titulo="Resumen">
        <FilaResumen label="Facturado" valor={formatMoney(totalFacturado)} />
        <FilaResumen label="Cobrado" valor={formatMoney(totalCobrado)} tono="g" />
        <FilaResumen label="Pendiente" valor={formatMoney(totalPendiente)} tono="a" />
        <FilaResumen label="Tasa de cobro" valor={`${tasaCobro}%`} tono="g" fuerte />
      </SeccionColapsable>

      {vista === "cliente" && (
        <SeccionColapsable titulo="Por cliente">
          {porCliente.length === 0 && <p className="text-xs text-muted">No hay datos para estos filtros.</p>}
          {porCliente.map((c) => (
            <div key={c.id} className="border-b border-border py-2.5 text-sm last:border-0">
              <div className="flex items-center justify-between">
                <span className="truncate font-medium">{c.nombre}</span>
                <span className="flex-shrink-0 font-medium text-teal">{formatMoney(c.facturado)}</span>
              </div>
              <p className="text-xs text-muted">
                {c.count} factura{c.count === 1 ? "" : "s"} · {formatMoney(c.cobrado)} cobrado
              </p>
              <BarraProgreso pct={(c.facturado / maxPorCliente) * 100} color="#1D9E75" />
            </div>
          ))}
        </SeccionColapsable>
      )}

      {vista === "servicio" && (
        <SeccionColapsable titulo="Por servicio">
          {itemsFacturados === null && <p className="text-xs text-muted">Cargando...</p>}
          {itemsFacturados !== null && porServicio.length === 0 && <p className="text-xs text-muted">No hay datos para estos filtros.</p>}
          {porServicio.map((s) => (
            <div key={s.descripcion} className="border-b border-border py-2.5 text-sm last:border-0">
              <div className="flex items-center justify-between">
                <span className="truncate font-medium">{s.descripcion}</span>
                <span className="flex-shrink-0 font-medium">{formatMoney(s.total)}</span>
              </div>
              <p className="text-xs text-muted">
                {s.count} línea{s.count === 1 ? "" : "s"}
              </p>
              <BarraProgreso pct={(s.total / maxPorServicio) * 100} color="#1D9E75" />
            </div>
          ))}
        </SeccionColapsable>
      )}

      {vista === "categoria" && (
        <SeccionColapsable titulo="Por categoría">
          {itemsFacturados === null && <p className="text-xs text-muted">Cargando...</p>}
          {itemsFacturados !== null && porCategoria.length === 0 && <p className="text-xs text-muted">No hay datos para estos filtros.</p>}
          {porCategoria.map((c) => (
            <div key={c.tipo} className="border-b border-border py-2.5 text-sm last:border-0">
              <div className="flex items-center justify-between">
                <span className="truncate font-medium">{c.tipo === "sin-categoria" ? "Sin categoría" : labelTipo(c.tipo)}</span>
                <span className="flex-shrink-0 font-medium">{formatMoney(c.total)}</span>
              </div>
              <p className="text-xs text-muted">
                {c.count} línea{c.count === 1 ? "" : "s"}
              </p>
              <BarraProgreso pct={(c.total / maxPorCategoria) * 100} color="#1D9E75" />
            </div>
          ))}
        </SeccionColapsable>
      )}

      {vista === "clienteServicio" && (
        <SeccionColapsable titulo="Cliente + servicio">
          {itemsFacturados === null && <p className="text-xs text-muted">Cargando...</p>}
          {itemsFacturados !== null && porClienteServicio.length === 0 && (
            <p className="text-xs text-muted">No hay datos para estos filtros.</p>
          )}
          {porClienteServicio.map((r, i) => (
            <div key={i} className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate">{r.cliente}</p>
                <p className="truncate text-xs text-muted">{r.servicio}</p>
              </div>
              <span className="flex-shrink-0 font-medium">{formatMoney(r.total)}</span>
            </div>
          ))}
        </SeccionColapsable>
      )}

      {vista === "retenciones" && (
        <SeccionColapsable titulo="Retenciones SURI" accionDerecha={<span className="text-sm font-medium text-teal">{formatMoney(totalRetenido)}</span>}>
          <p className="mb-2 text-xs text-muted">
            Lo que tus clientes te retuvieron y depositaron a Hacienda a tu nombre — cuadra esto contra lo que SURI te muestre al
            declarar, factura por factura.
          </p>
          {porRetencion.length === 0 && <p className="text-xs text-muted">No hay retenciones en este período.</p>}
          {porRetencion.map((c) => (
            <div key={c.nombre} className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate">{c.nombre}</p>
                <p className="truncate text-xs text-muted">
                  {c.count} factura{c.count === 1 ? "" : "s"} pagada{c.count === 1 ? "" : "s"} · {c.pct}% retenido sobre{" "}
                  {formatMoney(c.facturado)}
                </p>
              </div>
              <span className="flex-shrink-0 font-medium text-amb">{formatMoney(c.retenido)}</span>
            </div>
          ))}
        </SeccionColapsable>
      )}

      {vista === "flujo" && (
        <SeccionColapsable titulo="Flujo de cobro">
          {porMes.length === 0 && <p className="text-xs text-muted">No hay datos para estos filtros.</p>}
          {porMes.map((m) => (
            <div key={m.mes} className="border-b border-border py-2.5 text-sm last:border-0">
              <div className="flex items-center justify-between">
                <span className="truncate font-medium capitalize">{mesLabel(m.mes)}</span>
                <span className="flex-shrink-0 font-medium">{formatMoney(m.facturado)}</span>
              </div>
              <p className="text-xs text-muted">{formatMoney(m.cobrado)} cobrado</p>
              <BarraProgreso pct={m.facturado > 0 ? (m.cobrado / m.facturado) * 100 : 0} color="#1D9E75" />
            </div>
          ))}
        </SeccionColapsable>
      )}

      {/* Cuadre de recaudo (2 sept 2026, pedido de Joel con desglose contable
          de experto): Facturación Bruta → Retenciones → Recaudado →
          Comisiones → Depósito neto, calcado del asiento contable real.
          "Facturado" arriba en Resumen cubre TODO el período (pagado o no);
          esta cascada es solo sobre lo YA COBRADO, para que cuadre contra lo
          que de verdad entró al banco. */}
      {facturasPagadas.length > 0 && (
        <div className="mb-3 rounded-2xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Cuadre de recaudo (facturas cobradas)</p>
          <FilaResumen label="Facturación bruta cobrada" valor={formatMoney(brutoCobrado)} />
          {totalRetenido > 0 && <FilaResumen label="Retenciones en la fuente" valor={`-${formatMoney(totalRetenido)}`} tono="a" />}
          <FilaResumen label="Recaudado (cuentas por cobrar)" valor={formatMoney(totalCobrado)} />
          {gastoProcesamientoPeriodo > 0 && (
            <FilaResumen label="Comisiones de pasarela (ATH/Stripe)" valor={`-${formatMoney(gastoProcesamientoPeriodo)}`} tono="a" />
          )}
          <FilaResumen label="Depósito neto en banco" valor={formatMoney(depositoNetoBanco)} tono="g" fuerte />
        </div>
      )}

      <div className="mb-3 rounded-2xl p-4" style={{ background: "#1D9E75" }}>
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,.75)" }}>
          Créditos en Hacienda (retenciones acumuladas)
        </p>
        <p className="mt-1 text-2xl font-medium text-white">{formatMoney(totalRetenido)}</p>
        <p className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,.75)" }}>
          Lo que tus clientes retuvieron y depositaron a Hacienda a tu nombre en este período.
        </p>
      </div>

      {gastoProcesamientoPeriodo > 0 && (
        <div className="mb-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] text-muted">Gasto procesamiento de pagos (deducible)</p>
          <p className="mt-1 text-2xl font-medium text-red">-{formatMoney(gastoProcesamientoPeriodo)}</p>
          <p className="mt-1 text-[11px] text-muted">
            Lo que se fue en fees de ATH Móvil Business y Stripe sobre las facturas pagadas de este período.
          </p>
        </div>
      )}

      {/* Resumen ejecutivo para Planilla/Hacienda (2 sept 2026) — lo que va
          en cada línea de la planilla de contribuciones: el ingreso bruto
          real facturado (subtotal, TODO el período — no solo lo cobrado,
          porque el ingreso se reporta cuando se factura/devenga, no cuando
          se cobra), el gasto deducible de comisiones, y el crédito
          contributivo acumulado por retenciones. */}
      <div className="mb-3 rounded-2xl border border-border bg-card p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Resumen ejecutivo para planilla</p>
        <FilaResumen label="Ingreso reportable (planilla)" valor={formatMoney(totalFacturado)} fuerte />
        {gastoProcesamientoPeriodo > 0 && (
          <FilaResumen label="Gasto deducible (merchant fees)" valor={formatMoney(gastoProcesamientoPeriodo)} tono="a" />
        )}
        {totalRetenido > 0 && <FilaResumen label="Crédito contributivo acumulado (SURI)" valor={formatMoney(totalRetenido)} tono="g" />}
        <p className="mt-2 text-[11px] text-muted">
          Tus clientes le van a informar a Hacienda cuánto te pagaron y retuvieron en las Informativas 480.6SP/480.6A — este ingreso
          reportable debe cuadrar con eso. No sustituye asesoría de tu CPA.
        </p>
      </div>

      <div className="flex gap-2">
        <a href={pdfHref} target="_blank" rel="noreferrer" className="vc-btn-primary flex-1 text-center">
          <i className="ti ti-file-text" /> Exportar PDF
        </a>
        <a
          href={csvHref}
          className="flex-1 rounded-lg border border-border py-2.5 text-center text-xs font-medium text-muted hover:opacity-80"
        >
          Exportar CSV
        </a>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted">{label}</label>
      {children}
    </div>
  );
}
