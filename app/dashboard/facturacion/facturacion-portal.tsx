"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatFecha } from "@/lib/format";

type Cliente = {
  id: string;
  name: string;
  email: string | null;
  es_negocio: boolean;
  retention_pct: number;
  entity_id: string | null;
};

type Factura = {
  id: string;
  numero: string;
  subtotal: number;
  retencion_monto: number;
  total: number;
  estado: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  client_id: string | null;
  clients: { name: string } | null;
};

type Servicio = {
  id: string;
  nombre: string;
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

const TABS = [
  { id: "facturas", label: "Facturas", icon: "ti-file-invoice" },
  { id: "cotizaciones", label: "Cotizaciones", icon: "ti-file-description" },
  { id: "cobros", label: "Cobros", icon: "ti-cash" },
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
  tabInicial,
}: {
  clients: Cliente[];
  facturas: Factura[];
  servicios: Servicio[];
  cotizaciones: Cotizacion[];
  entidadId: string | null;
  tabInicial?: string;
}) {
  const tabValido = TABS.some((t) => t.id === tabInicial);
  const [tab, setTab] = useState<TabId>(tabValido ? (tabInicial as TabId) : "facturas");

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-muted hover:opacity-80">
          ← VICTOR
        </Link>
      </div>

      <div className="mb-4 rounded-2xl border border-teal bg-teal/[.04] p-3.5">
        <div className="mb-3">
          <p className="text-lg font-medium">Facturación</p>
          <p className="text-xs text-muted">Portal completo</p>
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

      {tab === "facturas" && <FacturasTab facturas={facturas} />}
      {tab === "cobros" && <CobrosTab facturasIniciales={facturas.filter((f) => f.estado !== "borrador" && f.estado !== "pagada")} />}
      {tab === "clientes" && <ClientesTab clients={clients} />}
      {tab === "cotizaciones" && <CotizacionesTab cotizaciones={cotizaciones} />}
      {tab === "servicios" && <ServiciosTab servicios={servicios} entidadId={entidadId} />}
      {tab === "reportes" && <ReportesTab facturas={facturas} />}
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

function FacturasTab({ facturas }: { facturas: Factura[] }) {
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

function FilaFactura({ factura }: { factura: Factura }) {
  const nombre = factura.clients?.name ?? "Sin cliente";
  return (
    <Link
      href={`/dashboard/facturacion/${factura.id}`}
      className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-0"
    >
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
        style={{ background: colorAvatar(factura.client_id ?? factura.id) }}
      >
        {iniciales(nombre)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{nombre}</p>
        <p className="truncate text-xs text-muted">
          #{factura.numero} · {formatFecha(factura.fecha_emision)}
        </p>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-medium">{formatMoney(Number(factura.total))}</span>
        <Badge estado={estadoMostrado(factura)} />
      </div>
    </Link>
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

const METODOS_PAGO = ["ATH Móvil", "Transferencia", "Cheque", "Efectivo", "Tarjeta", "Otro"];

function CobrosTab({ facturasIniciales }: { facturasIniciales: Factura[] }) {
  const supabase = createClient();
  const [facturas, setFacturas] = useState(facturasIniciales);
  const [pagando, setPagando] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState(METODOS_PAGO[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function marcarPagada(id: string) {
    setLoading(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ estado: "pagada", metodo_pago: metodoPago })
      .eq("id", id);
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setFacturas((prev) => prev.filter((f) => f.id !== id));
    setPagando(null);
  }

  const vencidas = facturas.filter(estaVencida);
  const pendientes = facturas.filter((f) => !estaVencida(f));
  const totalPendiente = facturas.reduce((s, f) => s + Number(f.total), 0);
  const totalVencido = vencidas.reduce((s, f) => s + Number(f.total), 0);

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <StatCard label="Por cobrar" valor={formatMoney(totalPendiente)} sub={`${facturas.length} factura${facturas.length === 1 ? "" : "s"}`} tono="a" />
        <StatCard label="Vencidas" valor={formatMoney(totalVencido)} sub={`${vencidas.length} factura${vencidas.length === 1 ? "" : "s"}`} tono="r" />
      </div>

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Facturas pendientes</p>
        {error && <p className="mb-2 text-xs text-red">{error}</p>}

        {facturas.length === 0 && <p className="text-xs text-muted">No tienes facturas pendientes de cobro ahora mismo.</p>}

        {[...vencidas, ...pendientes].map((f) => {
          const vencida = estaVencida(f);
          const nombre = f.clients?.name ?? "Sin cliente";
          return (
            <div key={f.id} className="border-b border-border py-2.5 text-sm last:border-0">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                  style={{ background: colorAvatar(f.client_id ?? f.id) }}
                >
                  {iniciales(nombre)}
                </div>
                <Link href={`/dashboard/facturacion/${f.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">#{f.numero} · {nombre}</p>
                  <p className="truncate text-xs text-muted">
                    {vencida ? (
                      <span className="text-red">venció {formatFecha(f.fecha_vencimiento)}</span>
                    ) : (
                      <span>vence {formatFecha(f.fecha_vencimiento)}</span>
                    )}
                  </p>
                </Link>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="font-medium">{formatMoney(Number(f.total))}</span>
                  {pagando !== f.id && (
                    <button
                      className="rounded-lg border border-teal px-2.5 py-1.5 text-xs font-medium text-teal hover:opacity-80"
                      onClick={() => setPagando(f.id)}
                    >
                      Marcar pagada
                    </button>
                  )}
                </div>
              </div>

              {pagando === f.id && (
                <div className="mt-2 flex items-center gap-2 pl-[42px]">
                  <select className="vc-input flex-1" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                    {METODOS_PAGO.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <button className="vc-btn-primary flex-shrink-0" disabled={loading} onClick={() => marcarPagada(f.id)}>
                    {loading ? "..." : "Confirmar"}
                  </button>
                  <button className="flex-shrink-0 text-xs text-muted hover:opacity-80" onClick={() => setPagando(null)}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function ClientesTab({ clients }: { clients: Cliente[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");

  const filtrados = useMemo(() => {
    return clients.filter((c) => {
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
        </select>
      </div>

      <div className="vc-card">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted">
            Directorio <span className="normal-case text-muted">· {clients.length} cliente{clients.length === 1 ? "" : "s"}</span>
          </p>
          <Link
            href="/dashboard/clientes/nuevo?returnTo=/dashboard/facturacion"
            className="text-xs font-medium text-teal hover:opacity-80"
          >
            + Nuevo cliente
          </Link>
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
            href={`/dashboard/clientes/${c.id}/editar?returnTo=/dashboard/facturacion`}
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
  const [tipo, setTipo] = useState<(typeof TIPOS_SERVICIO)[number]["value"]>("fijo");
  const [precio, setPrecio] = useState("");
  const [ivuExento, setIvuExento] = useState(true);

  function abrirNuevo() {
    setFormAbierto("nuevo");
    setNombre("");
    setTipo("fijo");
    setPrecio("");
    setIvuExento(true);
    setError(null);
  }

  function abrirEditar(s: Servicio) {
    setFormAbierto(s.id);
    setNombre(s.nombre);
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
          tipo,
          precio: Number(precio),
          ivu_exento: ivuExento,
        })
        .select("id, nombre, tipo, precio, ivu_exento, activo, entity_id")
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
        .update({ nombre: nombre.trim(), tipo, precio: Number(precio), ivu_exento: ivuExento })
        .eq("id", formAbierto);
      setGuardando(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setLista((prev) =>
        prev.map((s) => (s.id === formAbierto ? { ...s, nombre: nombre.trim(), tipo, precio: Number(precio), ivu_exento: ivuExento } : s))
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

const PERIODOS = [
  { value: "mes", label: "Este mes" },
  { value: "anio", label: "Este año" },
  { value: "todo", label: "Todo" },
] as const;

function inicioPeriodo(periodo: string): string {
  const hoy = new Date();
  if (periodo === "mes") return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  if (periodo === "anio") return new Date(hoy.getFullYear(), 0, 1).toISOString().slice(0, 10);
  return "0000-01-01";
}

function ReportesTab({ facturas }: { facturas: Factura[] }) {
  const supabase = createClient();
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["value"]>("mes");
  const [itemsFacturados, setItemsFacturados] = useState<
    { descripcion: string; subtotal_linea: number; estado: string; fecha_emision: string }[] | null
  >(null);

  useEffect(() => {
    let activo = true;
    supabase
      .from("invoice_items")
      .select("descripcion, subtotal_linea, cantidad, precio_unitario, invoices(estado, fecha_emision)")
      .then(({ data }) => {
        if (!activo) return;
        const filas = (data ?? []).map((it: any) => ({
          descripcion: it.descripcion as string,
          subtotal_linea: Number(it.subtotal_linea ?? it.cantidad * it.precio_unitario),
          estado: it.invoices?.estado ?? "borrador",
          fecha_emision: it.invoices?.fecha_emision ?? "",
        }));
        setItemsFacturados(filas);
      });
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const desde = inicioPeriodo(periodo);
  const facturasFiltradas = useMemo(
    () => facturas.filter((f) => f.estado !== "borrador" && f.fecha_emision >= desde),
    [facturas, desde]
  );

  const porCliente = useMemo(() => {
    const mapa = new Map<string, { nombre: string; facturado: number; cobrado: number; count: number }>();
    for (const f of facturasFiltradas) {
      const key = f.client_id ?? "sin-cliente";
      const nombre = f.clients?.name ?? "Sin cliente";
      const actual = mapa.get(key) ?? { nombre, facturado: 0, cobrado: 0, count: 0 };
      actual.facturado += Number(f.total);
      if (f.estado === "pagada") actual.cobrado += Number(f.total);
      actual.count += 1;
      mapa.set(key, actual);
    }
    return [...mapa.values()].sort((a, b) => b.facturado - a.facturado);
  }, [facturasFiltradas]);

  const porServicio = useMemo(() => {
    if (!itemsFacturados) return [];
    const mapa = new Map<string, { descripcion: string; total: number; count: number }>();
    for (const it of itemsFacturados) {
      if (it.estado === "borrador" || it.fecha_emision < desde) continue;
      const actual = mapa.get(it.descripcion) ?? { descripcion: it.descripcion, total: 0, count: 0 };
      actual.total += it.subtotal_linea;
      actual.count += 1;
      mapa.set(it.descripcion, actual);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [itemsFacturados, desde]);

  const totalFacturado = facturasFiltradas.reduce((s, f) => s + Number(f.total), 0);
  const totalCobrado = facturasFiltradas.filter((f) => f.estado === "pagada").reduce((s, f) => s + Number(f.total), 0);

  return (
    <>
      <div className="mb-3 flex gap-1.5">
        {PERIODOS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriodo(p.value)}
            className="flex-1 rounded-lg px-2 py-2 text-xs font-medium"
            style={
              periodo === p.value
                ? { background: "#1D9E75", color: "#fff" }
                : { background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <StatCard label="Facturado" valor={formatMoney(totalFacturado)} sub={`${facturasFiltradas.length} facturas`} />
        <StatCard
          label="Cobrado"
          valor={formatMoney(totalCobrado)}
          sub={totalFacturado > 0 ? `${Math.round((totalCobrado / totalFacturado) * 100)}%` : "0%"}
          tono="g"
        />
      </div>

      <div className="vc-card mb-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Ingresos por cliente</p>
        {porCliente.length === 0 && <p className="text-xs text-muted">No hay facturas en este período.</p>}
        {porCliente.map((c) => (
          <div key={c.nombre} className="flex items-center gap-2.5 border-b border-border py-2.5 text-sm last:border-0">
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
              style={{ background: colorAvatar(c.nombre) }}
            >
              {iniciales(c.nombre)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate">{c.nombre}</p>
              <p className="truncate text-xs text-muted">
                {c.count} factura{c.count === 1 ? "" : "s"} · {formatMoney(c.cobrado)} cobrado
              </p>
            </div>
            <span className="flex-shrink-0 font-medium">{formatMoney(c.facturado)}</span>
          </div>
        ))}
      </div>

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Ingresos por servicio (top 10)</p>
        {itemsFacturados === null && <p className="text-xs text-muted">Cargando...</p>}
        {itemsFacturados !== null && porServicio.length === 0 && (
          <p className="text-xs text-muted">No hay líneas de factura en este período.</p>
        )}
        {porServicio.map((s) => (
          <div key={s.descripcion} className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
            <div className="min-w-0 flex-1">
              <p className="truncate">{s.descripcion}</p>
              <p className="text-xs text-muted">
                {s.count} línea{s.count === 1 ? "" : "s"}
              </p>
            </div>
            <span className="flex-shrink-0 font-medium">{formatMoney(s.total)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
