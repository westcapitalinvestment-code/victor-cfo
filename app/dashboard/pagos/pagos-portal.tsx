"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatFecha } from "@/lib/format";

type Vendor = {
  id: string;
  name: string;
  tax_id: string | null;
  vendor_type: string;
  retention_type: string | null;
  default_retention_pct: number;
  active: boolean;
  entity_id: string | null;
};

type Retencion = {
  id: string;
  vendor_id: string;
  gross_amount: number;
  retention_pct: number;
  retention_amount: number;
  net_paid: number;
  period_start: string | null;
  period_end: string | null;
  remittance_status: string;
  entity_id: string | null;
  created_at: string;
};

const TABS = [
  { id: "pagos", label: "Pagos", icon: "ti-cash" },
  { id: "contratistas", label: "Contratistas", icon: "ti-users" },
  { id: "reportes", label: "Reportes", icon: "ti-chart-bar" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Misma paleta/hash que Facturación, para que los avatares de iniciales se
// sientan consistentes entre los dos portales.
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

// Trimestre calendario (Ene-Mar, Abr-Jun, Jul-Sep, Oct-Dic) — el mismo
// agrupamiento que pide Hacienda PR para el 480.6A/B.
function trimestreDe(fechaISO: string): number {
  return Math.ceil(Number(fechaISO.slice(5, 7)) / 3);
}

function rangoTrimestre(anio: number, trimestre: number): { desde: string; hasta: string } {
  const mesInicio = (trimestre - 1) * 3 + 1;
  const mesFin = mesInicio + 2;
  const ultimoDia = new Date(anio, mesFin, 0).getDate();
  return {
    desde: `${anio}-${String(mesInicio).padStart(2, "0")}-01`,
    hasta: `${anio}-${String(mesFin).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

const TIPOS_RETENCION = [
  { value: "480.6B", label: "480.6B — sujeto a retención" },
  { value: "480.6A", label: "480.6A — exento de retención" },
] as const;

// Portal de Pagos a contratistas (2 sept 2026, pedido de Joel). Alcance
// acordado: el sistema calcula bruto/retención 480.6/neto por corrida de
// pago — Joel toma esos números y los sube a mano al ACH de BPPR, como hace
// hoy. No se genera archivo ACH ni se guardan cuentas bancarias de nadie.
export default function PagosPortal({
  vendors,
  retenciones,
  entidadId,
  retencionDefault,
}: {
  vendors: Vendor[];
  retenciones: Retencion[];
  entidadId: string | null;
  retencionDefault: number;
}) {
  const [tab, setTab] = useState<TabId>("pagos");

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
            <p className="text-lg font-medium">Pagos</p>
            <p className="text-xs text-muted">Contratistas y retención 480.6</p>
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

      {tab === "pagos" && <PagosTab vendors={vendors} retenciones={retenciones} entidadId={entidadId} />}
      {tab === "contratistas" && <ContratistasTab vendors={vendors} entidadId={entidadId} retencionDefault={retencionDefault} />}
      {tab === "reportes" && <ReportesTab vendors={vendors} retenciones={retenciones} entidadId={entidadId} />}
    </div>
  );
}

// Sección con +/- para minimizar (2 sept 2026, pedido de Joel: "veo una
// lista laaarga de pagos recientes, puedes ponerle un minimizador") —
// arranca cerrada por default cuando la lista puede crecer mucho.
function SeccionColapsable({
  titulo,
  defaultAbierta = true,
  children,
}: {
  titulo: string;
  defaultAbierta?: boolean;
  children: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(defaultAbierta);
  return (
    <div className="vc-card">
      <button type="button" className="flex w-full items-center justify-between" onClick={() => setAbierta((v) => !v)}>
        <p className="text-xs uppercase tracking-wide text-muted">{titulo}</p>
        <i className={`ti ${abierta ? "ti-minus" : "ti-plus"} text-muted`} style={{ fontSize: 13 }} />
      </button>
      {abierta && <div className="mt-2">{children}</div>}
    </div>
  );
}

// ============================================================================
// Tab: Pagos — corrida tipo nómina (pedido de Joel: calcado de cómo lo hace
// hoy en Excel — un solo periodo, monto bruto por contratista, y de un tirón
// ve bruto/retenido/neto de todos).
// ============================================================================
function PagosTab({ vendors, retenciones, entidadId }: { vendors: Vendor[]; retenciones: Retencion[]; entidadId: string | null }) {
  const supabase = createClient();
  const router = useRouter();
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [pcts, setPcts] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ nombre: string; neto: number }[] | null>(null);
  const [copiado, setCopiado] = useState(false);

  const activos = useMemo(() => vendors.filter((v) => v.active).sort((a, b) => a.name.localeCompare(b.name)), [vendors]);

  function pctDe(v: Vendor): number {
    const override = pcts[v.id];
    return override !== undefined && override !== "" ? Number(override) : Number(v.default_retention_pct);
  }

  const filas = useMemo(() => {
    return activos
      .map((v) => {
        const bruto = Number(montos[v.id] || 0);
        const pct = pctDe(v);
        const retenido = Math.round(bruto * (pct / 100) * 100) / 100;
        const neto = bruto - retenido;
        return { vendor: v, bruto, pct, retenido, neto };
      })
      .filter((f) => f.bruto > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activos, montos, pcts]);

  const totalBruto = filas.reduce((s, f) => s + f.bruto, 0);
  const totalRetenido = filas.reduce((s, f) => s + f.retenido, 0);
  const totalNeto = filas.reduce((s, f) => s + f.neto, 0);

  // Pote de "ya retenido este trimestre" — mismo cálculo que usará Reportes,
  // aquí solo como referencia rápida mientras registra la corrida.
  const trimestreActual = trimestreDe(fechaPago);
  const anioActual = Number(fechaPago.slice(0, 4));
  const { desde: desdeTrim, hasta: hastaTrim } = rangoTrimestre(anioActual, trimestreActual);
  const retenidoTrimestre = retenciones
    .filter((r) => r.period_end && r.period_end >= desdeTrim && r.period_end <= hastaTrim)
    .reduce((s, r) => s + Number(r.retention_amount), 0);

  async function registrarCorrida() {
    if (filas.length === 0) return;
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

    const inserts = filas.map((f) => ({
      owner_id: user.id,
      entity_id: entidadId,
      vendor_id: f.vendor.id,
      gross_amount: f.bruto,
      retention_pct: f.pct,
      retention_amount: f.retenido,
      period_start: fechaPago,
      period_end: fechaPago,
      remittance_status: "pendiente",
    }));

    const { error: insertError } = await supabase.from("vendor_retenciones").insert(inserts);
    setGuardando(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setResultado(filas.map((f) => ({ nombre: f.vendor.name, neto: f.neto })));
    setMontos({});
    setCopiado(false);
    router.refresh();
  }

  function copiarResultado() {
    if (!resultado) return;
    const texto = resultado.map((r) => `${r.nombre}\t${r.neto.toFixed(2)}`).join("\n");
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  // Historial reciente — últimas 20 retenciones, con el nombre del
  // contratista resuelto localmente (retenciones solo trae vendor_id). Se
  // deriva directamente del prop `retenciones` (no una copia local aparte)
  // porque router.refresh() actualiza props sin remontar este componente —
  // una copia en useState() nunca vería esa actualización. `eliminados` es
  // solo para que el borrado se sienta instantáneo mientras se espera el
  // refresh del servidor.
  const vendorPorId = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const [eliminados, setEliminados] = useState<Set<string>>(new Set());
  const historialOrdenado = useMemo(
    () =>
      retenciones
        .filter((r) => !eliminados.has(r.id))
        .sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? "") || b.created_at.localeCompare(a.created_at))
        .slice(0, 20),
    [retenciones, eliminados]
  );

  async function eliminarRetencion(id: string) {
    if (!confirm("¿Eliminar este registro de pago? Esto no revierte nada en el banco, solo borra el número de aquí.")) return;
    setEliminados((prev) => new Set(prev).add(id));
    const { error: deleteError } = await supabase.from("vendor_retenciones").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      setEliminados((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    router.refresh();
  }

  if (activos.length === 0) {
    return (
      <div className="vc-card text-center">
        <i className="ti ti-users mb-2 text-2xl text-teal" />
        <p className="mb-1 text-sm font-medium">Todavía no tienes contratistas activos</p>
        <p className="text-xs text-muted">Ve al tab "Contratistas" y añade a los que les pagas por servicios profesionales.</p>
      </div>
    );
  }

  return (
    <>
      <div className="vc-card mb-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-muted">Corrida de pago</p>
          <input
            type="date"
            className="vc-input flex-shrink-0"
            style={{ width: "auto" }}
            value={fechaPago}
            onChange={(e) => setFechaPago(e.target.value)}
          />
        </div>
        <p className="mb-2 text-xs text-muted">
          Retenido en Q{trimestreActual} {anioActual}: <span className="font-medium text-text">{formatMoney(retenidoTrimestre)}</span>
        </p>

        {error && <p className="mb-2 text-xs text-red">{error}</p>}

        <div className="flex flex-col divide-y divide-border">
          {activos.map((v) => {
            const bruto = montos[v.id] || "";
            const pct = pcts[v.id] !== undefined ? pcts[v.id] : String(v.default_retention_pct);
            const brutoNum = Number(bruto || 0);
            const pctNum = Number(pct || 0);
            const retenido = Math.round(brutoNum * (pctNum / 100) * 100) / 100;
            const neto = brutoNum - retenido;
            return (
              <div key={v.id} className="flex items-center gap-2 py-2.5">
                <div
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                  style={{ background: colorAvatar(v.id) }}
                >
                  {iniciales(v.name)}
                </div>
                <p className="min-w-0 flex-1 truncate text-sm">{v.name}</p>
                <div className="relative flex-shrink-0">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                  <input
                    className="vc-input"
                    style={{ width: 128, paddingLeft: 22 }}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={bruto}
                    onChange={(e) => setMontos((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  />
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <input
                    className="vc-input flex-shrink-0"
                    style={{ width: 68 }}
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={pct}
                    onChange={(e) => setPcts((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  />
                  <span className="text-xs text-muted">%</span>
                </div>
                <span className="w-16 flex-shrink-0 text-right text-xs text-amb">-{formatMoney(retenido)}</span>
                <span className="w-20 flex-shrink-0 text-right text-sm font-medium">{formatMoney(brutoNum > 0 ? neto : 0)}</span>
              </div>
            );
          })}
        </div>

        {filas.length > 0 && (
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
            <span className="text-muted">
              Bruto {formatMoney(totalBruto)} · Retenido {formatMoney(totalRetenido)}
            </span>
            <span className="font-medium">Neto {formatMoney(totalNeto)}</span>
          </div>
        )}

        <button className="vc-btn-primary mt-3" disabled={filas.length === 0 || guardando} onClick={registrarCorrida}>
          {guardando ? "Guardando..." : `Registrar corrida${filas.length > 0 ? ` (${filas.length})` : ""}`}
        </button>
      </div>

      {resultado && (
        <div className="vc-card mb-3 border border-teal">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-teal">Listo — esto es lo que subes al ACH de BPPR</p>
            <button className="text-xs font-medium text-teal hover:opacity-80" onClick={copiarResultado}>
              {copiado ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          {resultado.map((r) => (
            <div key={r.nombre} className="flex justify-between border-b border-border py-1.5 text-sm last:border-0">
              <span>{r.nombre}</span>
              <span className="font-medium">{formatMoney(r.neto)}</span>
            </div>
          ))}
        </div>
      )}

      <SeccionColapsable titulo={`Pagos recientes${historialOrdenado.length > 0 ? ` (${historialOrdenado.length})` : ""}`} defaultAbierta={false}>
        {historialOrdenado.length === 0 && <p className="text-xs text-muted">Todavía no has registrado ningún pago.</p>}
        {historialOrdenado.map((r) => {
          const v = vendorPorId.get(r.vendor_id);
          return (
            <div key={r.id} className="flex items-center gap-2 border-b border-border py-2 text-sm last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate">{v?.name ?? "Contratista eliminado"}</p>
                <p className="text-xs text-muted">
                  {formatFecha(r.period_start)} · Bruto {formatMoney(Number(r.gross_amount))} · Retenido{" "}
                  {formatMoney(Number(r.retention_amount))} ({Number(r.retention_pct)}%)
                </p>
              </div>
              <span className="flex-shrink-0 text-sm font-medium">{formatMoney(Number(r.net_paid))}</span>
              <button onClick={() => eliminarRetencion(r.id)} className="flex-shrink-0 text-muted hover:text-red" title="Eliminar">
                <i className="ti ti-trash" style={{ fontSize: 14 }} />
              </button>
            </div>
          );
        })}
      </SeccionColapsable>
    </>
  );
}

// ============================================================================
// Tab: Contratistas — catálogo (calcado de ServiciosTab en Facturación). Se
// archiva en vez de borrar (toggle "active") porque vendor_retenciones tiene
// ON DELETE CASCADE hacia vendors — borrar de verdad se llevaría el
// historial de pagos/retenciones del contratista.
// ============================================================================
function ContratistasTab({
  vendors,
  entidadId,
  retencionDefault,
}: {
  vendors: Vendor[];
  entidadId: string | null;
  retencionDefault: number;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [lista, setLista] = useState(vendors);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("activos");
  const [formAbierto, setFormAbierto] = useState<"nuevo" | string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [retentionType, setRetentionType] = useState<(typeof TIPOS_RETENCION)[number]["value"]>("480.6B");
  const [pct, setPct] = useState(String(retencionDefault));

  function abrirNuevo() {
    setFormAbierto("nuevo");
    setName("");
    setTaxId("");
    setRetentionType("480.6B");
    setPct(String(retencionDefault));
    setError(null);
  }

  function abrirEditar(v: Vendor) {
    setFormAbierto(v.id);
    setName(v.name);
    setTaxId(v.tax_id ?? "");
    setRetentionType((v.retention_type as (typeof TIPOS_RETENCION)[number]["value"]) || "480.6B");
    setPct(String(v.default_retention_pct));
    setError(null);
  }

  function cambiarTipoRetencion(valor: (typeof TIPOS_RETENCION)[number]["value"]) {
    setRetentionType(valor);
    setPct(valor === "480.6A" ? "0" : String(retencionDefault));
  }

  async function guardar() {
    if (!name.trim()) return;
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
        .from("vendors")
        .insert({
          owner_id: user.id,
          entity_id: entidadId,
          name: name.trim(),
          tax_id: taxId.trim() || null,
          vendor_type: "contratista_servicios",
          retention_type: retentionType,
          default_retention_pct: Number(pct || 0),
          active: true,
        })
        .select("id, name, tax_id, vendor_type, retention_type, default_retention_pct, active, entity_id")
        .single();
      setGuardando(false);
      if (insertError || !data) {
        setError(insertError?.message ?? "No se pudo guardar.");
        return;
      }
      setLista((prev) => [data as Vendor, ...prev]);
      setFormAbierto(null);
      router.refresh();
    } else if (formAbierto) {
      const { error: updateError } = await supabase
        .from("vendors")
        .update({ name: name.trim(), tax_id: taxId.trim() || null, retention_type: retentionType, default_retention_pct: Number(pct || 0) })
        .eq("id", formAbierto);
      setGuardando(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setLista((prev) =>
        prev.map((v) =>
          v.id === formAbierto
            ? { ...v, name: name.trim(), tax_id: taxId.trim() || null, retention_type: retentionType, default_retention_pct: Number(pct || 0) }
            : v
        )
      );
      setFormAbierto(null);
      router.refresh();
    }
  }

  async function toggleActivo(v: Vendor) {
    const { error: updateError } = await supabase.from("vendors").update({ active: !v.active }).eq("id", v.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLista((prev) => prev.map((x) => (x.id === v.id ? { ...x, active: !x.active } : x)));
    router.refresh();
  }

  const filtrados = useMemo(() => {
    return lista.filter((v) => {
      if (filtro === "archivados") return !v.active;
      if (filtro === "activos" && !v.active) return false;
      if (busqueda.trim() && !v.name.toLowerCase().includes(busqueda.toLowerCase())) return false;
      return true;
    });
  }, [lista, filtro, busqueda]);

  return (
    <>
      <div className="mb-3 flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-teal" />
          <input
            className="vc-input w-full min-w-0"
            style={{ paddingLeft: 32 }}
            placeholder="Buscar contratista..."
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
          <option value="activos">Activos</option>
          <option value="todos">Todos</option>
          <option value="archivados">Archivados</option>
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
            {formAbierto === "nuevo" ? "Nuevo contratista" : "Editar contratista"}
          </p>
          {error && <p className="text-xs text-red">{error}</p>}
          <input className="vc-input" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            className="vc-input"
            placeholder="Tax ID / SSN (opcional)"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
          />
          <div className="flex gap-2">
            <select
              className="vc-input flex-1"
              value={retentionType}
              onChange={(e) => cambiarTipoRetencion(e.target.value as (typeof TIPOS_RETENCION)[number]["value"])}
            >
              {TIPOS_RETENCION.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex w-20 flex-shrink-0 items-center gap-1">
              <input
                className="vc-input"
                type="number"
                step="0.1"
                min="0"
                max="100"
                disabled={retentionType === "480.6A"}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
              />
              <span className="text-xs text-muted">%</span>
            </div>
          </div>
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
          Contratistas <span className="normal-case text-muted">· {filtrados.length}</span>
        </p>

        {lista.length === 0 && (
          <p className="text-xs text-muted">Todavía no tienes contratistas. Dale a "+ Nuevo" arriba para añadir al primero.</p>
        )}
        {lista.length > 0 && filtrados.length === 0 && <p className="text-xs text-muted">No hay contratistas que coincidan.</p>}

        {filtrados.map((v) => (
          <div key={v.id} className="border-b border-border py-2.5 text-sm last:border-0">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
                style={{ background: colorAvatar(v.id) }}
              >
                {iniciales(v.name)}
              </div>
              <button className="min-w-0 flex-1 text-left" onClick={() => abrirEditar(v)}>
                <p className="truncate">
                  {v.name} {!v.active && <span className="text-xs text-muted">(archivado)</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {v.retention_type === "480.6A" ? "480.6A · exento" : `480.6B · ${Number(v.default_retention_pct)}%`}
                  {v.tax_id ? ` · ${v.tax_id}` : ""}
                </p>
              </button>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button onClick={() => abrirEditar(v)} className="text-muted hover:text-teal">
                  <i className="ti ti-edit" style={{ fontSize: 15 }} />
                </button>
                <button
                  onClick={() => toggleActivo(v)}
                  className="text-xs font-medium text-muted hover:text-teal"
                  title={v.active ? "Archivar" : "Reactivar"}
                >
                  <i className={`ti ${v.active ? "ti-archive" : "ti-refresh"}`} style={{ fontSize: 15 }} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// Botones de periodo — calcado 1:1 de PERIODOS en Reportes de Facturación
// (2 sept 2026, pedido de Joel: mantener el trimestre y añadirle "Rango" al
// lado, no reemplazarlo por un toggle de dos opciones).
const PERIODOS_PAGOS = [
  { value: "mes", label: "Este mes" },
  { value: "trimestre", label: "Trimestre" },
  { value: "anio", label: "Este año" },
  { value: "todo", label: "Todo" },
  { value: "rango", label: "Rango" },
] as const;

function inicioPeriodoPagos(periodo: string, rangoDesde: string): string {
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

function finPeriodoPagos(periodo: string, rangoHasta: string): string {
  if (periodo === "rango") return rangoHasta || hoyISO();
  return hoyISO();
}

// Combobox con búsqueda + "Todos" fijo adentro del scroll — calcado del
// ComboBuscable de Reportes en Facturación (2 sept 2026, pedido de Joel:
// "igual que clientes... por ejemplo si quiero saber cuanto pagué... por
// todos los vendors o por x vendor"). Duplicado aquí a propósito, mismo
// patrón que el resto del código (cada portal trae su propia copia).
function ComboBuscableVendor<T extends { id: string }>({
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

// ============================================================================
// Tab: Reportes — resumen trimestral por contratista (lo que Joel necesita
// para llenar el 480.6A/B) + export CSV.
// ============================================================================
function ReportesTab({
  vendors,
  retenciones,
  entidadId,
}: {
  vendors: Vendor[];
  retenciones: Retencion[];
  entidadId: string | null;
}) {
  // Mismos botones de periodo que Reportes de Facturación (2 sept 2026,
  // pedido de Joel: "como estaba con trimestres pero que le añadieras un
  // rango" — o sea, no reemplazar el trimestre, añadir "Rango" al lado como
  // una quinta opción, igual que ya funciona allá).
  const [periodo, setPeriodo] = useState<(typeof PERIODOS_PAGOS)[number]["value"]>("trimestre");
  const [rangoDesde, setRangoDesde] = useState(hoyISO());
  const [rangoHasta, setRangoHasta] = useState(hoyISO());
  // Q1-Q4 dentro del botón "Trimestre" (como estaba antes de añadir el
  // botón "Rango", pedido de Joel: "en trimestre añademe un scrolldown de
  // Q1, Q2, Q3, Q4 como estaba").
  const [trimestre, setTrimestre] = useState(trimestreDe(hoyISO()));
  const [anioTrimestre, setAnioTrimestre] = useState(Number(hoyISO().slice(0, 4)));
  // Filtro por contratista — combobox con búsqueda y "Todos" adentro del
  // scroll, calcado del de Cliente/Servicio en Reportes de Facturación
  // (pedido de Joel: "igual que clientes... por ejemplo si quiero saber
  // cuanto pagué y retuve la bisemana o el mes de agosto por todos los
  // vendors o por x vendor").
  const [vendorFiltro, setVendorFiltro] = useState("");

  const { desde, hasta } =
    periodo === "trimestre"
      ? rangoTrimestre(anioTrimestre, trimestre)
      : { desde: inicioPeriodoPagos(periodo, rangoDesde), hasta: finPeriodoPagos(periodo, rangoHasta) };
  const vendorPorId = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const vendorsOrdenados = useMemo(() => [...vendors].sort((a, b) => a.name.localeCompare(b.name)), [vendors]);

  const enRango = useMemo(
    () =>
      retenciones.filter((r) => {
        if (!r.period_end || r.period_end < desde || r.period_end > hasta) return false;
        if (vendorFiltro && r.vendor_id !== vendorFiltro) return false;
        return true;
      }),
    [retenciones, desde, hasta, vendorFiltro]
  );

  const porContratista = useMemo(() => {
    const mapa = new Map<string, { nombre: string; taxId: string | null; bruto: number; retenido: number; neto: number; count: number }>();
    for (const r of enRango) {
      const v = vendorPorId.get(r.vendor_id);
      const nombre = v?.name ?? "Contratista eliminado";
      const actual = mapa.get(r.vendor_id) ?? { nombre, taxId: v?.tax_id ?? null, bruto: 0, retenido: 0, neto: 0, count: 0 };
      actual.bruto += Number(r.gross_amount);
      actual.retenido += Number(r.retention_amount);
      actual.neto += Number(r.net_paid);
      actual.count += 1;
      mapa.set(r.vendor_id, actual);
    }
    return [...mapa.values()].sort((a, b) => b.retenido - a.retenido);
  }, [enRango, vendorPorId]);

  const totalBruto = porContratista.reduce((s, c) => s + c.bruto, 0);
  const totalRetenido = porContratista.reduce((s, c) => s + c.retenido, 0);
  const totalNeto = porContratista.reduce((s, c) => s + c.neto, 0);

  const paramsExport = `desde=${desde}&hasta=${hasta}${entidadId ? `&entityId=${entidadId}` : ""}${vendorFiltro ? `&vendorIds=${vendorFiltro}` : ""}`;
  const csvHref = `/api/pagos/reportes/csv?${paramsExport}`;
  const pdfHref = `/api/pagos/reportes/pdf?${paramsExport}`;

  return (
    <>
      {/* El bloque entero (botones + lo que se despliega) vive dentro de UN
          mismo contenedor con borde/fondo teal — así "Trimestre"/"Rango" se
          ven visualmente pegados al Q1-Q4 o las fechas que abren debajo, en
          vez de sentirse como una caja suelta aparte (pedido de Joel, 2 sept
          2026: "delimitar con color lo que abre abajo... lo mismo en
          Facturas"). La flechita (ti-chevron-down) en el botón activo marca
          cuál opción es la que tiene algo desplegado. */}
      <div className="mb-3 rounded-xl border border-teal/30 bg-teal/[.05] p-2">
        <div className="flex gap-1.5">
          {PERIODOS_PAGOS.map((p) => {
            const tieneDesplegable = p.value === "trimestre" || p.value === "rango";
            return (
              <button
                key={p.value}
                onClick={() => setPeriodo(p.value)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium"
                style={
                  periodo === p.value
                    ? { background: "#1D9E75", color: "#fff" }
                    : { background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }
                }
              >
                {p.label}
                {tieneDesplegable && (
                  <i
                    className={`ti ti-chevron-down`}
                    style={{ fontSize: 12, transform: periodo === p.value ? "rotate(180deg)" : "none", transition: "transform .15s" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {periodo === "trimestre" && (
          <div className="mt-2 flex gap-1.5 border-t border-teal/20 pt-2">
            <select className="vc-input flex-1" value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value))}>
              <option value={1}>Q1 — Ene a Mar</option>
              <option value={2}>Q2 — Abr a Jun</option>
              <option value={3}>Q3 — Jul a Sep</option>
              <option value={4}>Q4 — Oct a Dic</option>
            </select>
            <input
              className="vc-input flex-shrink-0"
              style={{ width: 90 }}
              type="number"
              value={anioTrimestre}
              onChange={(e) => setAnioTrimestre(Number(e.target.value))}
            />
          </div>
        )}

        {periodo === "rango" && (
          <div className="mt-2 flex gap-1.5 border-t border-teal/20 pt-2">
            <input type="date" className="vc-input flex-1" value={rangoDesde} onChange={(e) => setRangoDesde(e.target.value)} />
            <input type="date" className="vc-input flex-1" value={rangoHasta} onChange={(e) => setRangoHasta(e.target.value)} />
          </div>
        )}
      </div>

      <div className="vc-card mb-3">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Contratista</p>
        <ComboBuscableVendor
          items={vendorsOrdenados}
          valorId={vendorFiltro}
          onSeleccionar={setVendorFiltro}
          etiqueta={(v) => v.name}
          etiquetaTodos="Todos los contratistas"
          placeholder="Buscar contratista..."
        />
        <p className="mt-1.5 text-xs text-muted">
          {formatFecha(desde)} — {formatFecha(hasta)}
        </p>
      </div>

      <div className="vc-card mb-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Resumen — para el 480.6A/B</p>
        <div className="flex justify-between py-0.5 text-sm">
          <span className="text-muted">Bruto pagado</span>
          <span>{formatMoney(totalBruto)}</span>
        </div>
        <div className="flex justify-between py-0.5 text-sm">
          <span className="text-muted">Retenido (crédito para remesar)</span>
          <span className="font-medium text-amb">{formatMoney(totalRetenido)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-border pt-1.5 text-sm font-medium">
          <span>Neto pagado</span>
          <span>{formatMoney(totalNeto)}</span>
        </div>
      </div>

      <div className="vc-card mb-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Por contratista</p>
        {porContratista.length === 0 && <p className="text-xs text-muted">No hay pagos registrados con estos filtros.</p>}
        {porContratista.map((c) => (
          <div key={c.nombre} className="border-b border-border py-2 text-sm last:border-0">
            <div className="flex justify-between">
              <span className="truncate">
                {c.nombre} <span className="text-xs text-muted">({c.count})</span>
              </span>
              <span className="font-medium">{formatMoney(c.retenido)}</span>
            </div>
            <p className="text-xs text-muted">
              Bruto {formatMoney(c.bruto)} · Neto {formatMoney(c.neto)}
              {c.taxId ? ` · ${c.taxId}` : ""}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <a href={pdfHref} target="_blank" rel="noopener noreferrer" className="vc-btn-secondary flex-1 text-center">
          Exportar PDF
        </a>
        <a href={csvHref} className="vc-btn-secondary flex-1 text-center">
          Exportar CSV
        </a>
      </div>
    </>
  );
}
