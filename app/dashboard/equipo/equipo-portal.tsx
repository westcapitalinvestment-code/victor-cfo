"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

type Tecnico = {
  id: string;
  name: string;
  phone: string | null;
  access_token: string;
  approval_mode: string | null;
  max_discount_pct: number;
  active: boolean;
  entity_id: string | null;
  vendor_id: string | null;
};

type Vendor = { id: string; name: string; active: boolean };

type Factura = {
  id: string;
  numero: string;
  technician_id: string;
  client_id: string;
  clients: { name: string } | null;
  estado: string;
  total: number;
  pendiente_revision_tecnico: boolean;
  fecha_emision: string;
  fecha_pago: string | null;
  metodo_pago: string | null;
  created_at: string;
};

type ItemFactura = {
  invoice_id: string;
  descripcion: string;
  cantidad: number;
  subtotal_linea: number;
  service_id: string | null;
  services: { nombre: string } | null;
};

type CotizacionAsignada = {
  id: string;
  numero: string;
  total: number;
  technician_id: string;
  clients: { name: string } | null;
};

type CotizacionPendienteRevision = {
  id: string;
  numero: string;
  total: number;
  technician_id: string;
  clients: { name: string } | null;
  technicians: { name: string } | null;
};

type Entidad = {
  id: string;
  name: string;
  equipo_aprobacion_default: string | null;
  equipo_tecnico_ve_precios: boolean;
  equipo_tecnico_cobra_vencidas: boolean;
  equipo_tecnico_anade_clientes: boolean;
  equipo_tecnico_aplica_descuento: boolean;
  equipo_tecnico_descuento_max_pct: number;
};

const TABS = [
  { id: "panel", label: "Panel", icon: "ti-layout-dashboard" },
  { id: "tecnicos", label: "Técnicos", icon: "ti-users" },
  { id: "reportes", label: "Reportes", icon: "ti-chart-bar" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function telefonoWhatsapp(telefono: string): string {
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length === 10) return `1${digitos}`;
  return digitos;
}

const ESTADO_LABEL: Record<string, { texto: string; clase: string }> = {
  borrador: { texto: "Asignada", clase: "text-muted" },
  enviada: { texto: "Enviada", clase: "text-grn" },
  vista: { texto: "Vista", clase: "text-grn" },
  vencida: { texto: "Vencida", clase: "text-red" },
  pagada: { texto: "Cobrada", clase: "text-grn" },
};

export default function EquipoPortal({
  tecnicos,
  vendors,
  facturas,
  items,
  cotizacionesAsignadas,
  cotizacionesPendientesRevision,
  entidad,
  vistaGlobalActiva,
  cantidadEntidades,
  addonTecnicosActivo,
}: {
  tecnicos: Tecnico[];
  vendors: Vendor[];
  facturas: Factura[];
  items: ItemFactura[];
  cotizacionesAsignadas: CotizacionAsignada[];
  cotizacionesPendientesRevision: CotizacionPendienteRevision[];
  entidad: Entidad;
  vistaGlobalActiva: boolean;
  cantidadEntidades: number;
  addonTecnicosActivo: boolean;
}) {
  const [tab, setTab] = useState<TabId>("panel");

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
            <p className="text-lg font-medium">Equipo</p>
            <p className="text-xs text-muted">Técnicos de campo y sus facturas</p>
          </div>
          <Link
            href={`/dashboard/entidades/${entidad.id}/editar`}
            className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-teal hover:opacity-80"
          >
            <i className="ti ti-settings" style={{ fontSize: 14 }} />
            Editar negocio
          </Link>
        </div>
        <div className="flex" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 4, gap: 3 }}>
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

      {vistaGlobalActiva && cantidadEntidades > 1 && (
        <div className="mb-3 rounded-lg border border-amb/30 bg-amb/[.08] p-2.5 text-xs text-amb">
          Equipo se administra por negocio, no en vista "Todas" — estás viendo <strong>{entidad.name}</strong>.
        </div>
      )}

      {tab === "panel" && (
        <PanelTab
          facturas={facturas}
          tecnicos={tecnicos}
          cotizacionesAsignadas={cotizacionesAsignadas}
          cotizacionesPendientesRevision={cotizacionesPendientesRevision}
        />
      )}
      {tab === "tecnicos" && (
        <TecnicosTab tecnicos={tecnicos} vendors={vendors} entidad={entidad} addonTecnicosActivo={addonTecnicosActivo} />
      )}
      {tab === "reportes" && <ReportesTab facturas={facturas} items={items} tecnicos={tecnicos} />}
    </div>
  );
}

// ============================================================================
// Tab: Panel — lo que pasa hoy (mockup de Joel): 3 métricas, chips por
// técnico, "Trabajos de hoy" con aprobar, y un roster corto del equipo.
// ============================================================================
function PanelTab({
  facturas,
  tecnicos,
  cotizacionesAsignadas,
  cotizacionesPendientesRevision,
}: {
  facturas: Factura[];
  tecnicos: Tecnico[];
  cotizacionesAsignadas: CotizacionAsignada[];
  cotizacionesPendientesRevision: CotizacionPendienteRevision[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [lista, setLista] = useState(facturas);
  const [filtroTecnico, setFiltroTecnico] = useState<string>("todos");
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listaCotizPendientes, setListaCotizPendientes] = useState(cotizacionesPendientesRevision);
  const [procesandoCotiz, setProcesandoCotiz] = useState<string | null>(null);

  const nombrePorTecnico = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tecnicos) m.set(t.id, t.name);
    return m;
  }, [tecnicos]);

  const hoy = hoyISO();
  const deHoy = useMemo(
    () => lista.filter((f) => f.fecha_emision === hoy || f.created_at?.slice(0, 10) === hoy),
    [lista, hoy]
  );
  const facturadoHoy = deHoy.reduce((s, f) => s + Number(f.total), 0);
  const cobradoHoy = lista.filter((f) => f.fecha_pago === hoy).reduce((s, f) => s + Number(f.total), 0);
  const pendientes = lista.filter((f) => f.pendiente_revision_tecnico);
  const pendientesMonto = pendientes.reduce((s, f) => s + Number(f.total), 0);

  const filtrados = useMemo(
    () => deHoy.filter((f) => filtroTecnico === "todos" || f.technician_id === filtroTecnico),
    [deHoy, filtroTecnico]
  );

  async function aprobar(f: Factura) {
    setProcesando(f.id);
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ estado: "enviada", pendiente_revision_tecnico: false })
      .eq("id", f.id);
    setProcesando(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLista((prev) => prev.map((x) => (x.id === f.id ? { ...x, estado: "enviada", pendiente_revision_tecnico: false } : x)));
    router.refresh();
  }

  // Aprobar/rechazar una cotización que el TÉCNICO armó desde cero (2 sept
  // 2026) — a diferencia de "aprobar" (factura), aquí sí puede rechazarse
  // porque el técnico le puso precio a algo que tú no pediste.
  async function aprobarCotizacion(c: CotizacionPendienteRevision) {
    setProcesandoCotiz(c.id);
    const { error: updateError } = await supabase
      .from("cotizaciones")
      .update({ estado: "enviada", pendiente_revision_tecnico: false })
      .eq("id", c.id);
    setProcesandoCotiz(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setListaCotizPendientes((prev) => prev.filter((x) => x.id !== c.id));
    router.refresh();
  }

  async function rechazarCotizacion(c: CotizacionPendienteRevision) {
    if (!window.confirm(`¿Rechazar la cotización ${c.numero} de ${nombrePorTecnico.get(c.technician_id) ?? "el técnico"}? No se le va a mandar al cliente.`)) return;
    setProcesandoCotiz(c.id);
    const { error: updateError } = await supabase
      .from("cotizaciones")
      .update({ estado: "rechazada", pendiente_revision_tecnico: false })
      .eq("id", c.id);
    setProcesandoCotiz(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setListaCotizPendientes((prev) => prev.filter((x) => x.id !== c.id));
    router.refresh();
  }

  const tecnicosActivos = tecnicos.filter((t) => t.active);

  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="vc-card">
          <p className="text-[10px] uppercase tracking-wide text-muted">Facturado hoy</p>
          <p className="text-lg font-medium">{formatMoney(facturadoHoy)}</p>
          <p className="text-[11px] text-muted">{deHoy.length} trabajo{deHoy.length === 1 ? "" : "s"}</p>
        </div>
        <div className="vc-card">
          <p className="text-[10px] uppercase tracking-wide text-muted">Cobrado hoy</p>
          <p className="text-lg font-medium text-teal">{formatMoney(cobradoHoy)}</p>
        </div>
        <div className="vc-card">
          <p className="text-[10px] uppercase tracking-wide text-muted">Pendientes</p>
          <p className="text-lg font-medium text-amb">{formatMoney(pendientesMonto)}</p>
          <p className="text-[11px] text-muted">por aprobar: {pendientes.length}</p>
        </div>
      </div>

      {tecnicosActivos.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setFiltroTecnico("todos")}
            className="flex-shrink-0 rounded-pill border px-3 py-1.5 text-xs font-medium"
            style={filtroTecnico === "todos" ? { background: "#1D9E75", borderColor: "#1D9E75", color: "#fff" } : { borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Todos
          </button>
          {tecnicosActivos.map((t) => (
            <button
              key={t.id}
              onClick={() => setFiltroTecnico(t.id)}
              className="flex-shrink-0 rounded-pill border px-3 py-1.5 text-xs font-medium"
              style={filtroTecnico === t.id ? { background: "#1D9E75", borderColor: "#1D9E75", color: "#fff" } : { borderColor: "var(--border)", color: "var(--muted)" }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mb-2 text-xs text-red">{error}</p>}

      {cotizacionesAsignadas.length > 0 && (
        <div className="vc-card mb-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">
            Cotizaciones asignadas, pendientes de hacer <span className="normal-case text-muted">· {cotizacionesAsignadas.length}</span>
          </p>
          <p className="mb-2 text-xs text-muted">Ya tienen visto bueno del cliente — el técnico las convierte en factura cuando llega al trabajo.</p>
          {cotizacionesAsignadas.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/facturacion/cotizaciones/${c.id}`}
              className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate">
                  {nombrePorTecnico.get(c.technician_id) ?? "Técnico"} → {c.clients?.name ?? "Sin cliente"}
                </p>
                <p className="text-xs text-muted">{c.numero}</p>
              </div>
              <p className="flex-shrink-0 font-medium">{formatMoney(c.total)}</p>
            </Link>
          ))}
        </div>
      )}

      {listaCotizPendientes.length > 0 && (
        <div className="vc-card mb-3" style={{ borderColor: "#F5A623" }}>
          <p className="mb-2 text-xs uppercase tracking-wide text-amb">
            Cotizaciones nuevas, pendientes de tu aprobación <span className="normal-case text-muted">· {listaCotizPendientes.length}</span>
          </p>
          <p className="mb-2 text-xs text-muted">El técnico le cotizó algo nuevo a un cliente en campo — revísalo antes de que le llegue.</p>
          {listaCotizPendientes.map((c) => (
            <div key={c.id} className="border-b border-border py-2.5 text-sm last:border-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate">
                    {c.technicians?.name ?? "Técnico"} → {c.clients?.name ?? "Sin cliente"}
                  </p>
                  <p className="truncate text-xs text-muted">{c.numero}</p>
                </div>
                <p className="flex-shrink-0 font-medium">{formatMoney(c.total)}</p>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  className="vc-btn-primary flex-1"
                  style={{ width: "auto" }}
                  disabled={procesandoCotiz === c.id}
                  onClick={() => aprobarCotizacion(c)}
                >
                  {procesandoCotiz === c.id ? "..." : "Aprobar y enviar"}
                </button>
                <Link
                  href={`/dashboard/facturacion/cotizaciones/${c.id}`}
                  className="flex flex-1 items-center justify-center rounded-lg border border-border py-2 text-xs font-medium"
                >
                  Ver detalle
                </Link>
                <button
                  className="flex-shrink-0 rounded-lg border border-red/40 px-3 py-2 text-xs font-medium text-red"
                  disabled={procesandoCotiz === c.id}
                  onClick={() => rechazarCotizacion(c)}
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="vc-card mb-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
          Trabajos de hoy <span className="normal-case text-muted">· {filtrados.length}</span>
        </p>
        {filtrados.length === 0 && <p className="text-xs text-muted">Nada registrado hoy todavía.</p>}
        {filtrados.map((f) => {
          const estado = f.pendiente_revision_tecnico
            ? { texto: "Revisión", clase: "text-amb" }
            : ESTADO_LABEL[f.estado] ?? { texto: f.estado, clase: "text-muted" };
          return (
            <div
              key={f.id}
              className="border-b border-border py-2.5 text-sm last:border-0"
              style={f.pendiente_revision_tecnico ? { borderLeft: "3px solid #F5A623", paddingLeft: 8, marginLeft: -8 } : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate">
                    {nombrePorTecnico.get(f.technician_id) ?? "Técnico"} → {f.clients?.name ?? "Sin cliente"}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {f.numero} · <span className={estado.clase}>{estado.texto}</span>
                  </p>
                </div>
                <p className="flex-shrink-0 font-medium">{formatMoney(f.total)}</p>
              </div>
              <div className="mt-2 flex gap-2">
                {f.pendiente_revision_tecnico && (
                  <button
                    className="vc-btn-primary flex-1"
                    style={{ width: "auto" }}
                    disabled={procesando === f.id}
                    onClick={() => aprobar(f)}
                  >
                    {procesando === f.id ? "..." : "Aprobar y enviar"}
                  </button>
                )}
                <Link
                  href={`/dashboard/facturacion/${f.id}`}
                  className="flex flex-1 items-center justify-center rounded-lg border border-border py-2 text-xs font-medium"
                >
                  Ver detalle
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Tu equipo</p>
        {tecnicosActivos.length === 0 && <p className="text-xs text-muted">Todavía no tienes técnicos activos.</p>}
        {tecnicosActivos.map((t) => {
          const deEsteTecnicoHoy = deHoy.filter((f) => f.technician_id === t.id);
          const cobradoDeEste = lista.filter((f) => f.technician_id === t.id && f.fecha_pago === hoy).reduce((s, f) => s + Number(f.total), 0);
          return (
            <div key={t.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <div>
                <p>{t.name}</p>
                <p className="text-xs text-muted">{deEsteTecnicoHoy.length} trabajo{deEsteTecnicoHoy.length === 1 ? "" : "s"} hoy</p>
              </div>
              <p className="font-medium">{cobradoDeEste > 0 ? formatMoney(cobradoDeEste) : "—"}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============================================================================
// Tab: Técnicos — configuración global de Equipo + CRUD de técnicos (PIN,
// link, WhatsApp, vínculo con Pagos), todo en la misma pestaña (pedido de
// Joel: "cada addon debe tener su configuración en la misma pestaña").
// ============================================================================
function TecnicosTab({
  tecnicos,
  vendors,
  entidad,
  addonTecnicosActivo,
}: {
  tecnicos: Tecnico[];
  vendors: Vendor[];
  entidad: Entidad;
  addonTecnicosActivo: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();

  const TOPE_TECNICOS_ADDON = 3;

  // Activar/desactivar el addon Equipo en Stripe ($20/mes, hasta 3
  // técnicos, 2 sept 2026, pedido de Joel) — un segundo subscription item
  // sobre la misma suscripción Pro, no un checkout aparte.
  const [activandoAddon, setActivandoAddon] = useState(false);
  const [errorAddon, setErrorAddon] = useState<string | null>(null);
  async function activarAddon() {
    setActivandoAddon(true);
    setErrorAddon(null);
    const res = await fetch("/api/stripe/addon-tecnicos/activar", { method: "POST" });
    const data = await res.json().catch(() => null);
    setActivandoAddon(false);
    if (!res.ok || !data?.ok) {
      setErrorAddon(data?.error ?? "No se pudo activar el addon.");
      return;
    }
    router.refresh();
  }
  async function desactivarAddon() {
    if (!window.confirm("¿Desactivar el addon Equipo? No vas a poder asignar técnicos nuevos hasta que lo actives de nuevo.")) return;
    setActivandoAddon(true);
    setErrorAddon(null);
    const res = await fetch("/api/stripe/addon-tecnicos/desactivar", { method: "POST" });
    const data = await res.json().catch(() => null);
    setActivandoAddon(false);
    if (!res.ok || !data?.ok) {
      setErrorAddon(data?.error ?? "No se pudo desactivar el addon.");
      return;
    }
    router.refresh();
  }

  // ---- Configuración global ----
  const [aprobacionDefault, setAprobacionDefault] = useState(entidad.equipo_aprobacion_default ?? "auto");
  const [vePrecios, setVePrecios] = useState(entidad.equipo_tecnico_ve_precios);
  const [cobraVencidas, setCobraVencidas] = useState(entidad.equipo_tecnico_cobra_vencidas);
  const [anadeClientes, setAnadeClientes] = useState(entidad.equipo_tecnico_anade_clientes);
  const [aplicaDescuento, setAplicaDescuento] = useState(entidad.equipo_tecnico_aplica_descuento);
  const [descuentoMaxPct, setDescuentoMaxPct] = useState(String(entidad.equipo_tecnico_descuento_max_pct));
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [configGuardada, setConfigGuardada] = useState(false);

  async function guardarConfig() {
    setGuardandoConfig(true);
    setConfigGuardada(false);
    const { error } = await supabase
      .from("business_entities")
      .update({
        equipo_aprobacion_default: aprobacionDefault,
        equipo_tecnico_ve_precios: vePrecios,
        equipo_tecnico_cobra_vencidas: cobraVencidas,
        equipo_tecnico_anade_clientes: anadeClientes,
        equipo_tecnico_aplica_descuento: aplicaDescuento,
        equipo_tecnico_descuento_max_pct: Number(descuentoMaxPct || 0),
      })
      .eq("id", entidad.id);
    setGuardandoConfig(false);
    if (!error) {
      setConfigGuardada(true);
      router.refresh();
      setTimeout(() => setConfigGuardada(false), 2500);
    }
  }

  // ---- Técnicos ----
  const [lista, setLista] = useState(tecnicos);
  const [formAbierto, setFormAbierto] = useState<"nuevo" | string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [approvalOverride, setApprovalOverride] = useState(""); // "" = global
  const [maxDescuento, setMaxDescuento] = useState("0");
  const [vendorId, setVendorId] = useState("");
  // "¿De mi lista de Pagos o alguien nuevo?" (2 sept 2026, pedido de Joel:
  // "probablemente es alguien que tengo en mi lista de pagos, ahi debe
  // aparecer es listado de abajo para escoger uno de ellos y si es otro
  // pues lo creo") — el vínculo con Pagos ahora es el PRIMER paso, no un
  // campo escondido al final.
  const [origenTecnico, setOrigenTecnico] = useState<"vendor" | "nuevo">("vendor");
  const [avanzadoAbierto, setAvanzadoAbierto] = useState(false);
  // El PIN solo existe en texto plano en el momento en que se acaba de
  // crear/restablecer (después queda solo el hash) — este estado guarda
  // ESE momento para poder mostrarlo/mandarlo por WhatsApp una sola vez,
  // en vez de perderlo (pedido de Joel: "si le asigno un PIN como el
  // técnico lo sabe?").
  const [pinParaCompartir, setPinParaCompartir] = useState<{ tecnico: { id: string; name: string; phone: string | null; access_token: string }; pin: string } | null>(null);

  function abrirNuevo() {
    setFormAbierto("nuevo");
    setName("");
    setPhone("");
    setPin("");
    setApprovalOverride("");
    setMaxDescuento("0");
    setVendorId("");
    setOrigenTecnico(vendors.length > 0 ? "vendor" : "nuevo");
    setAvanzadoAbierto(false);
    setError(null);
  }

  function abrirEditar(t: Tecnico) {
    setFormAbierto(t.id);
    setName(t.name);
    setPhone(t.phone ?? "");
    setPin("");
    setApprovalOverride(t.approval_mode ?? "");
    setMaxDescuento(String(t.max_discount_pct));
    setVendorId(t.vendor_id ?? "");
    setOrigenTecnico(t.vendor_id ? "vendor" : "nuevo");
    setAvanzadoAbierto(false);
    setError(null);
  }

  function seleccionarVendor(id: string) {
    setVendorId(id);
    const v = vendors.find((x) => x.id === id);
    if (v) setName(v.name);
  }

  async function guardar() {
    if (!name.trim()) return;
    if (formAbierto === "nuevo" && (!addonTecnicosActivo || tecnicos.filter((t) => t.active).length >= TOPE_TECNICOS_ADDON)) {
      setError("Necesitas el addon Equipo activo (y cupo disponible) para crear un técnico.");
      return;
    }
    if (formAbierto === "nuevo" && !/^\d{4}$/.test(pin)) {
      setError("El PIN debe ser de 4 dígitos.");
      return;
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      setError("El PIN debe ser de 4 dígitos.");
      return;
    }
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
        .from("technicians")
        .insert({
          owner_id: user.id,
          entity_id: entidad.id,
          name: name.trim(),
          phone: phone.trim() || null,
          pin_hash: "pendiente",
          approval_mode: approvalOverride || null,
          max_discount_pct: Number(maxDescuento || 0),
          vendor_id: vendorId || null,
          active: true,
        })
        .select("id, name, phone, access_token, approval_mode, max_discount_pct, active, entity_id, vendor_id")
        .single();

      if (insertError || !data) {
        setGuardando(false);
        setError(insertError?.message ?? "No se pudo guardar.");
        return;
      }

      const resPin = await fetch("/api/tecnico/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId: data.id, pin }),
      });
      setGuardando(false);
      if (!resPin.ok) {
        const d = await resPin.json().catch(() => null);
        setError(d?.error ?? "El técnico se creó, pero no se pudo fijar el PIN. Ábrelo y usa 'Restablecer PIN'.");
      } else {
        // Este es el único momento en que el PIN todavía existe en texto
        // plano — se muestra/manda por WhatsApp ahora o se pierde (queda
        // solo el hash, como el PIN de bloqueo del dueño).
        setPinParaCompartir({ tecnico: data as Tecnico, pin });
      }
      setLista((prev) => [data as Tecnico, ...prev]);
      setFormAbierto(null);
      router.refresh();
    } else if (formAbierto) {
      const { error: updateError } = await supabase
        .from("technicians")
        .update({
          name: name.trim(),
          phone: phone.trim() || null,
          approval_mode: approvalOverride || null,
          max_discount_pct: Number(maxDescuento || 0),
          vendor_id: vendorId || null,
        })
        .eq("id", formAbierto);

      if (updateError) {
        setGuardando(false);
        setError(updateError.message);
        return;
      }

      if (pin) {
        const resPin = await fetch("/api/tecnico/set-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ technicianId: formAbierto, pin }),
        });
        if (!resPin.ok) {
          const d = await resPin.json().catch(() => null);
          setGuardando(false);
          setError(d?.error ?? "No se pudo cambiar el PIN.");
          return;
        }
      }

      setGuardando(false);
      const actualizado = lista.find((t) => t.id === formAbierto);
      setLista((prev) =>
        prev.map((t) =>
          t.id === formAbierto
            ? {
                ...t,
                name: name.trim(),
                phone: phone.trim() || null,
                approval_mode: approvalOverride || null,
                max_discount_pct: Number(maxDescuento || 0),
                vendor_id: vendorId || null,
              }
            : t
        )
      );
      if (pin && actualizado) {
        setPinParaCompartir({ tecnico: { ...actualizado, name: name.trim(), phone: phone.trim() || null }, pin });
      }
      setFormAbierto(null);
      router.refresh();
    }
  }

  async function toggleActivo(t: Tecnico) {
    const { error: updateError } = await supabase.from("technicians").update({ active: !t.active }).eq("id", t.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLista((prev) => prev.map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)));
    router.refresh();
  }

  function linkDe(t: Tecnico): string {
    return `${window.location.origin}/tecnico?t=${t.access_token}`;
  }

  function copiarLink(t: Tecnico) {
    navigator.clipboard.writeText(linkDe(t)).then(() => {
      setLinkCopiado(t.id);
      setTimeout(() => setLinkCopiado(null), 2000);
    });
  }

  function enviarPorWhatsapp(t: Tecnico) {
    // No se puede incluir el PIN aquí — se guarda con hash de una sola vía
    // (igual que el PIN de bloqueo del dueño), así que nunca vuelve a estar
    // en texto plano después de fijarlo. El mensaje manda el link; el PIN
    // se lo comunicas tú aparte (o usa "Restablecer PIN" y compártelo justo
    // después, cuando todavía lo tienes en pantalla).
    const mensaje = `Hola ${t.name}, aquí está tu acceso a VICTOR CFO para registrar tus trabajos: ${linkDe(t)}`;
    const destino = t.phone ? telefonoWhatsapp(t.phone) : "";
    window.open(`https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`, "_blank");
  }

  async function resetearPin(t: Tecnico) {
    const nuevoPin = window.prompt(`Nuevo PIN de 4 dígitos para ${t.name}:`);
    if (!nuevoPin) return;
    if (!/^\d{4}$/.test(nuevoPin)) {
      window.alert("El PIN debe ser de 4 dígitos.");
      return;
    }
    const res = await fetch("/api/tecnico/set-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ technicianId: t.id, pin: nuevoPin }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      window.alert(d?.error ?? "No se pudo cambiar el PIN.");
      return;
    }
    setPinParaCompartir({ tecnico: t, pin: nuevoPin });
  }

  function enviarPinPorWhatsapp(t: { name: string; phone: string | null; access_token: string }, pinTexto: string) {
    if (!t.phone) {
      window.alert(`${t.name} no tiene teléfono guardado — añádeselo editándolo, o comparte el PIN por otro medio: ${pinTexto}`);
      return;
    }
    const mensaje = `Hola ${t.name}, aquí está tu acceso a VICTOR CFO: ${window.location.origin}/tecnico?t=${t.access_token} — tu PIN es ${pinTexto}`;
    window.open(`https://wa.me/${telefonoWhatsapp(t.phone)}?text=${encodeURIComponent(mensaje)}`, "_blank");
  }

  const tecnicosActivosCount = tecnicos.filter((t) => t.active).length;
  const topeAlcanzado = tecnicosActivosCount >= TOPE_TECNICOS_ADDON;

  return (
    <>
      <div
        className="mb-3 rounded-2xl border p-3.5"
        style={
          addonTecnicosActivo
            ? { borderColor: "var(--border)", background: "var(--card)" }
            : { borderColor: "#1D9E75", background: "rgba(29,158,117,.06)" }
        }
      >
        {errorAddon && <p className="mb-2 text-xs text-red">{errorAddon}</p>}
        {!addonTecnicosActivo ? (
          <>
            <p className="text-sm font-medium">Add-on Equipo — $20.00/mes</p>
            <p className="mb-2.5 text-xs text-muted">
              Incluye hasta {TOPE_TECNICOS_ADDON} técnicos. Se suma a tu factura de Pro — no es un plan aparte. Actívalo para
              poder crear técnicos y asignarles facturas/cotizaciones.
            </p>
            <button className="vc-btn-primary" style={{ width: "auto" }} disabled={activandoAddon} onClick={activarAddon}>
              {activandoAddon ? "Activando..." : "Activar addon"}
            </button>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                <i className="ti ti-circle-check text-teal" style={{ marginRight: 4 }} />
                Add-on Equipo activo — $20.00/mes
              </p>
              <p className="text-xs text-muted">
                {tecnicosActivosCount}/{TOPE_TECNICOS_ADDON} técnicos usados
              </p>
            </div>
            <button className="flex-shrink-0 text-xs text-muted underline hover:opacity-80" disabled={activandoAddon} onClick={desactivarAddon}>
              Desactivar
            </button>
          </div>
        )}
      </div>

      <div className="vc-card mb-3">
        <p className="mb-3 text-xs uppercase tracking-wide text-muted">Configuración de Equipo</p>

        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Aprobación de facturas (default)</p>
        <div className="mb-3 flex flex-col gap-2">
          <button
            onClick={() => setAprobacionDefault("auto")}
            className="rounded-lg border p-2.5 text-left text-xs"
            style={aprobacionDefault === "auto" ? { borderColor: "#1D9E75", background: "rgba(29,158,117,.06)" } : { borderColor: "var(--border)" }}
          >
            <p className="font-medium">Automático — salen directo</p>
            <p className="text-muted">El técnico crea la factura y el cliente la recibe al instante. Tú ves una copia en tu panel.</p>
          </button>
          <button
            onClick={() => setAprobacionDefault("manual")}
            className="rounded-lg border p-2.5 text-left text-xs"
            style={aprobacionDefault === "manual" ? { borderColor: "#1D9E75", background: "rgba(29,158,117,.06)" } : { borderColor: "var(--border)" }}
          >
            <p className="font-medium">Revisión previa — tú apruebas</p>
            <p className="text-muted">La factura queda pendiente hasta que la apruebes desde el Panel de Equipo.</p>
          </button>
        </div>

        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Qué puede hacer el técnico</p>
        <div className="flex flex-col gap-2">
          <TogglePermiso label="Ver precios del catálogo" desc="El técnico ve el precio de cada servicio" valor={vePrecios} onChange={setVePrecios} />
          <TogglePermiso label="Cobrar facturas pendientes del cliente" desc="Ve y cobra facturas vencidas en campo" valor={cobraVencidas} onChange={setCobraVencidas} />
          <TogglePermiso label="Añadir clientes nuevos" desc="Puede crear un cliente que no existe" valor={anadeClientes} onChange={setAnadeClientes} />
          <TogglePermiso label="Aplicar descuentos" desc="Hasta el % que configures por técnico" valor={aplicaDescuento} onChange={setAplicaDescuento} />
        </div>

        <button className="vc-btn-primary mt-3" disabled={guardandoConfig} onClick={guardarConfig}>
          {guardandoConfig ? "Guardando..." : configGuardada ? "Guardado ✓" : "Guardar configuración de equipo"}
        </button>
      </div>

      {addonTecnicosActivo && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {topeAlcanzado && (
            <p className="text-xs text-amb">Llegaste al tope de {TOPE_TECNICOS_ADDON} técnicos incluidos en el addon.</p>
          )}
          <button
            onClick={abrirNuevo}
            disabled={topeAlcanzado}
            className="ml-auto flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
            style={{ background: "#1D9E75", width: "auto" }}
          >
            <i className="ti ti-plus" /> Nuevo técnico
          </button>
        </div>
      )}

      {pinParaCompartir && (
        <div className="vc-card mb-3" style={{ borderColor: "#1D9E75" }}>
          <p className="mb-1 text-sm font-medium">PIN listo para {pinParaCompartir.tecnico.name}</p>
          <p className="mb-2 text-xs text-muted">Compártelo ahora — por seguridad no se puede volver a mostrar después de salir de aquí.</p>
          <div className="mb-2 flex items-center justify-between rounded-lg border border-border bg-bg p-2.5">
            <span className="font-mono text-lg tracking-[0.3em]">{pinParaCompartir.pin}</span>
            <button
              onClick={() => navigator.clipboard.writeText(pinParaCompartir.pin)}
              className="text-xs font-medium text-teal hover:opacity-80"
            >
              Copiar
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => enviarPinPorWhatsapp(pinParaCompartir.tecnico, pinParaCompartir.pin)}
              className="vc-btn-primary flex flex-1 items-center justify-center gap-1"
              style={{ width: "auto" }}
            >
              <i className="ti ti-brand-whatsapp" /> Enviar por WhatsApp
            </button>
            <button className="flex-shrink-0 px-3 text-xs text-muted hover:opacity-80" onClick={() => setPinParaCompartir(null)}>
              Listo
            </button>
          </div>
        </div>
      )}

      {formAbierto && (
        <div className="vc-card mb-3 flex flex-col gap-2.5">
          <p className="text-xs uppercase tracking-wide text-muted">{formAbierto === "nuevo" ? "Nuevo técnico" : "Editar técnico"}</p>
          {error && <p className="text-xs text-red">{error}</p>}

          {vendors.length > 0 && (
            <div className="flex" style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 3, gap: 3 }}>
              <button
                type="button"
                onClick={() => setOrigenTecnico("vendor")}
                className="flex-1 rounded-lg py-1.5 text-xs font-medium"
                style={origenTecnico === "vendor" ? { background: "#1D9E75", color: "#fff" } : { color: "var(--muted)" }}
              >
                De mi lista de Pagos
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrigenTecnico("nuevo");
                  setVendorId("");
                }}
                className="flex-1 rounded-lg py-1.5 text-xs font-medium"
                style={origenTecnico === "nuevo" ? { background: "#1D9E75", color: "#fff" } : { color: "var(--muted)" }}
              >
                Es alguien nuevo
              </button>
            </div>
          )}

          {origenTecnico === "vendor" && vendors.length > 0 && (
            <div>
              <label className="mb-1 block text-[11px] text-muted">Escoge de tu lista de Pagos</label>
              <SelectorBuscable items={vendors} valorId={vendorId} onSeleccionar={seleccionarVendor} placeholder="Buscar contratista..." etiqueta={(v) => v.name} />
            </div>
          )}

          <input className="vc-input" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="vc-input" placeholder="Teléfono (para WhatsApp)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input
            className="vc-input"
            placeholder={formAbierto === "nuevo" ? "PIN de 4 dígitos" : "Nuevo PIN (déjalo en blanco para no cambiarlo)"}
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          {pin && (
            <p className="text-[11px] text-muted">
              Al guardar te va a ofrecer mandar el link y este PIN por WhatsApp — es el único momento en que se puede compartir.
            </p>
          )}

          <button
            type="button"
            onClick={() => setAvanzadoAbierto((a) => !a)}
            className="-mb-1 text-left text-xs font-medium text-teal hover:opacity-80"
          >
            {avanzadoAbierto ? "− Ocultar" : "+"} Configuración avanzada (aprobación, descuento)
          </button>
          {avanzadoAbierto && (
            <div className="flex gap-2">
              <select className="vc-input flex-1" value={approvalOverride} onChange={(e) => setApprovalOverride(e.target.value)}>
                <option value="">Seguir la config. general del negocio ({aprobacionDefault === "manual" ? "revisión manual" : "automático"})</option>
                <option value="auto">Siempre automático para él, aunque el negocio esté en manual</option>
                <option value="manual">Siempre con tu revisión, aunque el negocio esté en automático</option>
              </select>
              <div className="flex w-24 flex-shrink-0 items-center gap-1">
                <input className="vc-input" type="number" min="0" max="100" value={maxDescuento} onChange={(e) => setMaxDescuento(e.target.value)} />
                <span className="text-xs text-muted">% desc.</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button className="vc-btn-primary flex-1" disabled={!name.trim() || guardando} onClick={guardar}>
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
          Técnicos <span className="normal-case text-muted">· {lista.length}</span>
        </p>
        {lista.length === 0 && addonTecnicosActivo && (
          <p className="text-xs text-muted">Todavía no tienes técnicos. Dale a "+ Nuevo técnico" arriba.</p>
        )}
        {lista.length === 0 && !addonTecnicosActivo && (
          <p className="text-xs text-muted">Activa el addon Equipo arriba para empezar a añadir técnicos.</p>
        )}

        {lista.map((t) => (
          <div key={t.id} className="border-b border-border py-3 text-sm last:border-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate">
                  {t.name} {!t.active && <span className="text-xs text-muted">(archivado)</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {t.approval_mode ? (t.approval_mode === "manual" ? "Forzado: revisión manual" : "Forzado: automático") : "Aprobación global"}
                  {t.phone ? ` · ${t.phone}` : ""}
                  {t.vendor_id ? " · vinculado a Pagos" : ""}
                </p>
              </div>
              <button
                onClick={() => toggleActivo(t)}
                className="flex-shrink-0 text-xs font-medium text-muted hover:text-teal"
                title={t.active ? "Archivar" : "Reactivar"}
              >
                <i className={`ti ${t.active ? "ti-archive" : "ti-refresh"}`} style={{ fontSize: 15 }} />
              </button>
            </div>
            <p className="mb-2 truncate text-[11px] text-teal">{linkDe(t)}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => enviarPorWhatsapp(t)}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium"
                title="Manda el link — el PIN solo se puede incluir justo cuando lo creas o restableces"
              >
                <i className="ti ti-brand-whatsapp text-teal" /> Reenviar link
              </button>
              <button onClick={() => copiarLink(t)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium">
                <i className={`ti ${linkCopiado === t.id ? "ti-check" : "ti-copy"}`} /> Copiar link
              </button>
              <button onClick={() => resetearPin(t)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium">
                <i className="ti ti-refresh" /> Restablecer PIN
              </button>
              <button onClick={() => abrirEditar(t)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium">
                <i className="ti ti-edit" /> Editar
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        El PIN queda fijo hasta que lo restablezcas — por seguridad no se puede volver a mostrar el que ya existe, solo generar uno
        nuevo. El link incluye un token único por técnico.
      </p>
    </>
  );
}

// Combobox con búsqueda — mismo patrón que en nueva-factura-form.tsx, para
// escoger un contratista de Pagos al crear un técnico.
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

  const filtrados = busqueda.trim() ? items.filter((i) => etiqueta(i).toLowerCase().includes(busqueda.trim().toLowerCase())) : items;

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

function TogglePermiso({ label, desc, valor, onChange }: { label: string; desc: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs">{label}</p>
        <p className="text-[11px] text-muted">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!valor)}
        className="relative flex-shrink-0 rounded-pill"
        style={{ width: 40, height: 22, background: valor ? "#1D9E75" : "var(--border)" }}
      >
        <span
          className="absolute top-0.5 rounded-full bg-white transition-all"
          style={{ width: 18, height: 18, left: valor ? 20 : 2 }}
        />
      </button>
    </div>
  );
}

// ============================================================================
// Tab: Reportes — por técnico, período y servicio (pedido de Joel).
// ============================================================================
const PERIODOS_EQUIPO = [
  { value: "mes", label: "Este mes" },
  { value: "trimestre", label: "Trimestre" },
  { value: "anio", label: "Este año" },
  { value: "todo", label: "Todo" },
  { value: "rango", label: "Rango" },
] as const;

function inicioPeriodoEquipo(periodo: string, rangoDesde: string): string {
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
function finPeriodoEquipo(periodo: string, rangoHasta: string): string {
  if (periodo === "rango") return rangoHasta || hoyISO();
  return hoyISO();
}

function ReportesTab({ facturas, items, tecnicos }: { facturas: Factura[]; items: ItemFactura[]; tecnicos: Tecnico[] }) {
  const [periodo, setPeriodo] = useState<(typeof PERIODOS_EQUIPO)[number]["value"]>("mes");
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [rangoDesde, setRangoDesde] = useState(hoyISO());
  const [rangoHasta, setRangoHasta] = useState(hoyISO());
  const [tecnicoFiltro, setTecnicoFiltro] = useState("");

  const desde = inicioPeriodoEquipo(periodo, rangoDesde);
  const hasta = finPeriodoEquipo(periodo, rangoHasta);

  const enRango = useMemo(
    () =>
      facturas.filter((f) => {
        if (f.fecha_emision < desde || f.fecha_emision > hasta) return false;
        if (tecnicoFiltro && f.technician_id !== tecnicoFiltro) return false;
        return true;
      }),
    [facturas, desde, hasta, tecnicoFiltro]
  );

  const facturado = enRango.reduce((s, f) => s + Number(f.total), 0);
  const cobrado = enRango.filter((f) => f.estado === "pagada").reduce((s, f) => s + Number(f.total), 0);

  const porTecnico = useMemo(() => {
    const mapa = new Map<string, { nombre: string; facturado: number; cobrado: number; count: number }>();
    for (const f of enRango) {
      const nombre = tecnicos.find((t) => t.id === f.technician_id)?.name ?? "Técnico";
      const actual = mapa.get(f.technician_id) ?? { nombre, facturado: 0, cobrado: 0, count: 0 };
      actual.facturado += Number(f.total);
      if (f.estado === "pagada") actual.cobrado += Number(f.total);
      actual.count += 1;
      mapa.set(f.technician_id, actual);
    }
    return [...mapa.values()].sort((a, b) => b.facturado - a.facturado);
  }, [enRango, tecnicos]);

  const idsEnRango = useMemo(() => new Set(enRango.map((f) => f.id)), [enRango]);
  const porServicio = useMemo(() => {
    const mapa = new Map<string, { nombre: string; monto: number; count: number }>();
    for (const it of items) {
      if (!idsEnRango.has(it.invoice_id)) continue;
      const nombre = it.services?.nombre ?? it.descripcion;
      const actual = mapa.get(nombre) ?? { nombre, monto: 0, count: 0 };
      actual.monto += Number(it.subtotal_linea);
      actual.count += 1;
      mapa.set(nombre, actual);
    }
    return [...mapa.values()].sort((a, b) => b.monto - a.monto);
  }, [items, idsEnRango]);

  return (
    <>
      <div className="mb-3 rounded-xl border border-teal/30 bg-teal/[.05] p-2">
        <div className="flex gap-1.5">
          {PERIODOS_EQUIPO.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                if (periodo === p.value) setPanelAbierto((a) => !a);
                else {
                  setPeriodo(p.value);
                  setPanelAbierto(true);
                }
              }}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium"
              style={periodo === p.value ? { background: "#1D9E75", color: "#fff" } : { background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }}
            >
              {p.label}
              {p.value === "rango" && (
                <i className="ti ti-chevron-down" style={{ fontSize: 12, transform: periodo === p.value && panelAbierto ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
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
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Técnico</p>
        <select className="vc-input" value={tecnicoFiltro} onChange={(e) => setTecnicoFiltro(e.target.value)}>
          <option value="">Todos</option>
          {tecnicos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="vc-card mb-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Resumen</p>
        <div className="flex items-center justify-between py-1 text-sm">
          <span className="text-muted">Facturado</span>
          <span className="font-medium">{formatMoney(facturado)}</span>
        </div>
        <div className="flex items-center justify-between py-1 text-sm">
          <span className="text-muted">Cobrado</span>
          <span className="font-medium text-teal">{formatMoney(cobrado)}</span>
        </div>
      </div>

      <div className="vc-card mb-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Por técnico</p>
        {porTecnico.length === 0 && <p className="text-xs text-muted">Sin datos en este período.</p>}
        {porTecnico.map((t) => (
          <div key={t.nombre} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
            <div>
              <p>{t.nombre}</p>
              <p className="text-xs text-muted">{t.count} trabajo{t.count === 1 ? "" : "s"}</p>
            </div>
            <p className="font-medium">{formatMoney(t.facturado)}</p>
          </div>
        ))}
      </div>

      <div className="vc-card">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Por servicio</p>
        {porServicio.length === 0 && <p className="text-xs text-muted">Sin datos en este período.</p>}
        {porServicio.map((s) => (
          <div key={s.nombre} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
            <div>
              <p className="truncate">{s.nombre}</p>
              <p className="text-xs text-muted">{s.count} línea{s.count === 1 ? "" : "s"}</p>
            </div>
            <p className="font-medium">{formatMoney(s.monto)}</p>
          </div>
        ))}
      </div>
    </>
  );
}
