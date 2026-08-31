"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

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
  tabInicial,
}: {
  clients: Cliente[];
  facturas: Factura[];
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
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap"
              style={
                tab === t.id
                  ? { background: "#1D9E75", color: "#fff" }
                  : { background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }
              }
            >
              <i className={`ti ${t.icon}`} style={{ fontSize: 13 }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "facturas" && <FacturasTab facturas={facturas} />}
      {tab === "cobros" && <CobrosTab facturasIniciales={facturas.filter((f) => f.estado !== "borrador" && f.estado !== "pagada")} />}
      {tab === "clientes" && <ClientesTab clients={clients} />}
      {tab === "cotizaciones" && (
        <Proximamente
          icono="ti-file-description"
          titulo="Cotizaciones"
          texto="Envía cotizaciones con depósito + balance, y conviértelas en factura en un toque cuando el cliente apruebe."
        />
      )}
      {tab === "servicios" && (
        <Proximamente
          icono="ti-package"
          titulo="Catálogo de servicios"
          texto="Guarda tus servicios más comunes con precio fijo para armar facturas y cotizaciones más rápido."
        />
      )}
      {tab === "reportes" && (
        <Proximamente
          icono="ti-chart-bar"
          titulo="Reportes"
          texto="Ingresos por cliente, por servicio, y reportes listos para tu CPA — en camino."
        />
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

      {creditosHacienda > 0 && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border bg-card p-3">
          <i className="ti ti-coins flex-shrink-0 text-lg text-teal" />
          <div className="flex-1">
            <p className="text-xs font-medium">Créditos en Hacienda</p>
            <p className="text-xs text-muted">{formatMoney(creditosHacienda)} acumulado</p>
          </div>
          <span className="text-sm font-medium text-teal">{formatMoney(creditosHacienda)}</span>
        </div>
      )}

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-teal" />
          <input
            className="vc-input pl-8"
            placeholder="Buscar factura, cliente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select className="vc-input w-32 flex-shrink-0" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="todas">Todas</option>
          <option value="pagadas">Pagadas</option>
          <option value="pendientes">Pendientes</option>
          <option value="vencidas">Vencidas</option>
          <option value="borradores">Borradores</option>
        </select>
        <Link href="/dashboard/facturacion/nueva" className="vc-btn-primary flex-shrink-0 px-3.5 py-0 text-xs" style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
          #{factura.numero} · {factura.fecha_emision}
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
                    {vencida ? <span className="text-red">venció {f.fecha_vencimiento}</span> : <span>vence {f.fecha_vencimiento}</span>}
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
  return (
    <div className="vc-card">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted">Clientes</p>
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

      {clients.map((c) => (
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
        </div>
      ))}
    </div>
  );
}
