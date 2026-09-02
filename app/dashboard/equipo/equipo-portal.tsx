"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatFecha } from "@/lib/format";

type Tecnico = {
  id: string;
  name: string;
  phone: string | null;
  access_token: string;
  approval_mode: string;
  max_discount_pct: number;
  active: boolean;
  entity_id: string | null;
};

type CatalogoItem = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  activo: boolean;
  entity_id: string;
};

type Visita = {
  id: string;
  technician_id: string;
  client_name_raw: string | null;
  estado: string;
  total: number;
  metodo_cobro: string | null;
  monto_cobrado: number | null;
  cobrado_at: string | null;
  requiere_aprobacion: boolean;
  created_at: string;
  entity_id: string;
};

const TABS = [
  { id: "tecnicos", label: "Técnicos", icon: "ti-users" },
  { id: "catalogo", label: "Catálogo", icon: "ti-list-details" },
  { id: "visitas", label: "Visitas", icon: "ti-clipboard-check" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const METODOS_COBRO = ["ATH Móvil", "Cheque", "Transferencia", "Efectivo", "Stripe"];

export default function EquipoPortal({
  tecnicos,
  catalogo,
  visitas,
  entidadId,
  entidadNombre,
  vistaGlobalActiva,
  cantidadEntidades,
}: {
  tecnicos: Tecnico[];
  catalogo: CatalogoItem[];
  visitas: Visita[];
  entidadId: string;
  entidadNombre: string;
  vistaGlobalActiva: boolean;
  cantidadEntidades: number;
}) {
  const [tab, setTab] = useState<TabId>("tecnicos");

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
            <p className="text-xs text-muted">Técnicos, catálogo y visitas de campo</p>
          </div>
          <Link
            href={`/dashboard/entidades/${entidadId}/editar`}
            className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-teal hover:opacity-80"
          >
            <i className="ti ti-settings" style={{ fontSize: 14 }} />
            Editar negocio
          </Link>
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

      {vistaGlobalActiva && cantidadEntidades > 1 && (
        <div className="mb-3 rounded-lg border border-amb/30 bg-amb/[.08] p-2.5 text-xs text-amb">
          Equipo se administra por negocio, no en vista "Todas" — estás viendo <strong>{entidadNombre}</strong>. Cambia de
          entidad en el selector de arriba si tienes técnicos en otro negocio.
        </div>
      )}

      {tab === "tecnicos" && <TecnicosTab tecnicos={tecnicos} entidadId={entidadId} />}
      {tab === "catalogo" && <CatalogoTab catalogo={catalogo} entidadId={entidadId} />}
      {tab === "visitas" && <VisitasTab visitas={visitas} tecnicos={tecnicos} />}
    </div>
  );
}

// ============================================================================
// Tab: Técnicos — crear/editar, fijar/cambiar PIN, copiar link, archivar.
// ============================================================================
function TecnicosTab({ tecnicos, entidadId }: { tecnicos: Tecnico[]; entidadId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [lista, setLista] = useState(tecnicos);
  const [formAbierto, setFormAbierto] = useState<"nuevo" | string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [approvalMode, setApprovalMode] = useState<"auto" | "manual">("auto");
  const [maxDescuento, setMaxDescuento] = useState("0");

  function abrirNuevo() {
    setFormAbierto("nuevo");
    setName("");
    setPhone("");
    setPin("");
    setApprovalMode("auto");
    setMaxDescuento("0");
    setError(null);
  }

  function abrirEditar(t: Tecnico) {
    setFormAbierto(t.id);
    setName(t.name);
    setPhone(t.phone ?? "");
    setPin("");
    setApprovalMode((t.approval_mode as "auto" | "manual") || "auto");
    setMaxDescuento(String(t.max_discount_pct));
    setError(null);
  }

  async function guardar() {
    if (!name.trim()) return;
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
      // pin_hash es NOT NULL en la tabla — se inserta un placeholder y de
      // inmediato se fija el de verdad vía /api/tecnico/set-pin (hashPin usa
      // Node "crypto", no se puede llamar desde el navegador).
      const { data, error: insertError } = await supabase
        .from("technicians")
        .insert({
          owner_id: user.id,
          entity_id: entidadId,
          name: name.trim(),
          phone: phone.trim() || null,
          pin_hash: "pendiente",
          approval_mode: approvalMode,
          max_discount_pct: Number(maxDescuento || 0),
          active: true,
        })
        .select("id, name, phone, access_token, approval_mode, max_discount_pct, active, entity_id")
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
        setError(d?.error ?? "El técnico se creó, pero no se pudo fijar el PIN. Ábrelo y usa 'Cambiar PIN'.");
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
          approval_mode: approvalMode,
          max_discount_pct: Number(maxDescuento || 0),
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
      setLista((prev) =>
        prev.map((t) =>
          t.id === formAbierto
            ? { ...t, name: name.trim(), phone: phone.trim() || null, approval_mode: approvalMode, max_discount_pct: Number(maxDescuento || 0) }
            : t
        )
      );
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

  function copiarLink(t: Tecnico) {
    const link = `${window.location.origin}/tecnico?t=${t.access_token}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopiado(t.id);
      setTimeout(() => setLinkCopiado(null), 2000);
    });
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          onClick={abrirNuevo}
          className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2.5 text-xs font-medium text-white hover:opacity-90"
          style={{ background: "#1D9E75", width: "auto" }}
        >
          <i className="ti ti-plus" /> Nuevo técnico
        </button>
      </div>

      {formAbierto && (
        <div className="vc-card mb-3 flex flex-col gap-2.5">
          <p className="text-xs uppercase tracking-wide text-muted">
            {formAbierto === "nuevo" ? "Nuevo técnico" : "Editar técnico"}
          </p>
          {error && <p className="text-xs text-red">{error}</p>}
          <input className="vc-input" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="vc-input" placeholder="Teléfono (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input
            className="vc-input"
            placeholder={formAbierto === "nuevo" ? "PIN de 4 dígitos" : "Nuevo PIN (déjalo en blanco para no cambiarlo)"}
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          <div className="flex gap-2">
            <select className="vc-input flex-1" value={approvalMode} onChange={(e) => setApprovalMode(e.target.value as "auto" | "manual")}>
              <option value="auto">Aprobación automática</option>
              <option value="manual">Requiere tu aprobación</option>
            </select>
            <div className="flex w-24 flex-shrink-0 items-center gap-1">
              <input
                className="vc-input"
                type="number"
                min="0"
                max="100"
                value={maxDescuento}
                onChange={(e) => setMaxDescuento(e.target.value)}
              />
              <span className="text-xs text-muted">% desc.</span>
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
          Técnicos <span className="normal-case text-muted">· {lista.length}</span>
        </p>

        {lista.length === 0 && (
          <p className="text-xs text-muted">Todavía no tienes técnicos. Dale a "+ Nuevo técnico" arriba para añadir al primero.</p>
        )}

        {lista.map((t) => (
          <div key={t.id} className="border-b border-border py-2.5 text-sm last:border-0">
            <div className="flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {t.name} {!t.active && <span className="text-xs text-muted">(archivado)</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {t.approval_mode === "manual" ? "Requiere aprobación" : "Aprobación automática"}
                  {t.phone ? ` · ${t.phone}` : ""}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button onClick={() => copiarLink(t)} className="text-xs font-medium text-teal hover:opacity-80" title="Copiar link del técnico">
                  <i className={`ti ${linkCopiado === t.id ? "ti-check" : "ti-link"}`} style={{ fontSize: 15 }} />
                </button>
                <button onClick={() => abrirEditar(t)} className="text-muted hover:text-teal">
                  <i className="ti ti-edit" style={{ fontSize: 15 }} />
                </button>
                <button
                  onClick={() => toggleActivo(t)}
                  className="text-xs font-medium text-muted hover:text-teal"
                  title={t.active ? "Archivar" : "Reactivar"}
                >
                  <i className={`ti ${t.active ? "ti-archive" : "ti-refresh"}`} style={{ fontSize: 15 }} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================================================================
// Tab: Catálogo de servicios del técnico.
// ============================================================================
function CatalogoTab({ catalogo, entidadId }: { catalogo: CatalogoItem[]; entidadId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [lista, setLista] = useState(catalogo);
  const [formAbierto, setFormAbierto] = useState<"nuevo" | string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");

  function abrirNuevo() {
    setFormAbierto("nuevo");
    setNombre("");
    setDescripcion("");
    setPrecio("");
    setError(null);
  }

  function abrirEditar(c: CatalogoItem) {
    setFormAbierto(c.id);
    setNombre(c.nombre);
    setDescripcion(c.descripcion ?? "");
    setPrecio(String(c.precio));
    setError(null);
  }

  async function guardar() {
    if (!nombre.trim() || Number(precio) < 0) return;
    setGuardando(true);
    setError(null);

    if (formAbierto === "nuevo") {
      const { data, error: insertError } = await supabase
        .from("technician_service_catalog")
        .insert({ entity_id: entidadId, nombre: nombre.trim(), descripcion: descripcion.trim() || null, precio: Number(precio), activo: true })
        .select("id, nombre, descripcion, precio, activo, entity_id")
        .single();
      setGuardando(false);
      if (insertError || !data) {
        setError(insertError?.message ?? "No se pudo guardar.");
        return;
      }
      setLista((prev) => [data as CatalogoItem, ...prev]);
      setFormAbierto(null);
      router.refresh();
    } else if (formAbierto) {
      const { error: updateError } = await supabase
        .from("technician_service_catalog")
        .update({ nombre: nombre.trim(), descripcion: descripcion.trim() || null, precio: Number(precio) })
        .eq("id", formAbierto);
      setGuardando(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setLista((prev) =>
        prev.map((c) => (c.id === formAbierto ? { ...c, nombre: nombre.trim(), descripcion: descripcion.trim() || null, precio: Number(precio) } : c))
      );
      setFormAbierto(null);
      router.refresh();
    }
  }

  async function toggleActivo(c: CatalogoItem) {
    const { error: updateError } = await supabase.from("technician_service_catalog").update({ activo: !c.activo }).eq("id", c.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLista((prev) => prev.map((x) => (x.id === c.id ? { ...x, activo: !x.activo } : x)));
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          onClick={abrirNuevo}
          className="flex flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2.5 text-xs font-medium text-white hover:opacity-90"
          style={{ background: "#1D9E75", width: "auto" }}
        >
          <i className="ti ti-plus" /> Nuevo servicio
        </button>
      </div>

      {formAbierto && (
        <div className="vc-card mb-3 flex flex-col gap-2.5">
          <p className="text-xs uppercase tracking-wide text-muted">{formAbierto === "nuevo" ? "Nuevo servicio" : "Editar servicio"}</p>
          {error && <p className="text-xs text-red">{error}</p>}
          <input className="vc-input" placeholder="Nombre (ej. Instalación AC 2 ton)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <input className="vc-input" placeholder="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
            <input
              className="vc-input w-full"
              style={{ paddingLeft: 18 }}
              type="number"
              step="0.01"
              min="0"
              placeholder="Precio"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button className="vc-btn-primary flex-1" disabled={!nombre.trim() || guardando} onClick={guardar}>
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
          Catálogo <span className="normal-case text-muted">· {lista.length}</span>
        </p>
        {lista.length === 0 && <p className="text-xs text-muted">Todavía no tienes servicios en el catálogo.</p>}
        {lista.map((c) => (
          <div key={c.id} className="border-b border-border py-2.5 text-sm last:border-0">
            <div className="flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {c.nombre} {!c.activo && <span className="text-xs text-muted">(inactivo)</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {formatMoney(c.precio)}
                  {c.descripcion ? ` · ${c.descripcion}` : ""}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button onClick={() => abrirEditar(c)} className="text-muted hover:text-teal">
                  <i className="ti ti-edit" style={{ fontSize: 15 }} />
                </button>
                <button onClick={() => toggleActivo(c)} className="text-xs font-medium text-muted hover:text-teal" title={c.activo ? "Desactivar" : "Activar"}>
                  <i className={`ti ${c.activo ? "ti-archive" : "ti-refresh"}`} style={{ fontSize: 15 }} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ============================================================================
// Tab: Visitas — lo que van registrando los técnicos desde /tecnico. Aprobar
// (si el técnico requiere aprobación) y marcar cobrado quedan aquí.
// ============================================================================
const ESTADO_LABEL: Record<string, { texto: string; clase: string }> = {
  en_progreso: { texto: "En progreso", clase: "text-muted" },
  requiere_aprobacion: { texto: "Requiere aprobación", clase: "text-amb" },
  pendiente_cobro: { texto: "Pendiente de cobro", clase: "text-amb" },
  cobrado: { texto: "Cobrado", clase: "text-grn" },
  enviado: { texto: "Enviado", clase: "text-grn" },
};

function VisitasTab({ visitas, tecnicos }: { visitas: Visita[]; tecnicos: Tecnico[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [lista, setLista] = useState(visitas);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [cobrandoId, setCobrandoId] = useState<string | null>(null);
  const [metodoCobro, setMetodoCobro] = useState(METODOS_COBRO[0]);
  const [error, setError] = useState<string | null>(null);

  const nombrePorTecnico = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tecnicos) m.set(t.id, t.name);
    return m;
  }, [tecnicos]);

  async function aprobar(v: Visita) {
    setProcesando(v.id);
    const { error: updateError } = await supabase
      .from("technician_visits")
      .update({ estado: "pendiente_cobro", requiere_aprobacion: false, aprobado_at: new Date().toISOString() })
      .eq("id", v.id);
    setProcesando(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLista((prev) => prev.map((x) => (x.id === v.id ? { ...x, estado: "pendiente_cobro", requiere_aprobacion: false } : x)));
    router.refresh();
  }

  async function confirmarCobrado(v: Visita) {
    setProcesando(v.id);
    const { error: updateError } = await supabase
      .from("technician_visits")
      .update({ estado: "cobrado", metodo_cobro: metodoCobro, monto_cobrado: v.total, cobrado_at: new Date().toISOString() })
      .eq("id", v.id);
    setProcesando(null);
    setCobrandoId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setLista((prev) =>
      prev.map((x) => (x.id === v.id ? { ...x, estado: "cobrado", metodo_cobro: metodoCobro, monto_cobrado: v.total } : x))
    );
    router.refresh();
  }

  return (
    <div className="vc-card">
      <p className="mb-2 text-xs uppercase tracking-wide text-muted">
        Visitas recientes <span className="normal-case text-muted">· {lista.length}</span>
      </p>
      {error && <p className="mb-2 text-xs text-red">{error}</p>}

      {lista.length === 0 && <p className="text-xs text-muted">Todavía no hay visitas registradas por el equipo.</p>}

      {lista.map((v) => {
        const estado = ESTADO_LABEL[v.estado] ?? { texto: v.estado, clase: "text-muted" };
        return (
          <div key={v.id} className="border-b border-border py-2.5 text-sm last:border-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate">{v.client_name_raw || "Sin nombre de cliente"}</p>
                <p className="truncate text-xs text-muted">
                  {nombrePorTecnico.get(v.technician_id) ?? "Técnico"} · {formatFecha(v.created_at)} ·{" "}
                  <span className={estado.clase}>{estado.texto}</span>
                </p>
              </div>
              <p className="flex-shrink-0 font-medium">{formatMoney(v.total)}</p>
            </div>

            {v.estado === "requiere_aprobacion" && (
              <button
                className="vc-btn-primary mt-2"
                style={{ width: "auto" }}
                disabled={procesando === v.id}
                onClick={() => aprobar(v)}
              >
                {procesando === v.id ? "Aprobando..." : "Aprobar"}
              </button>
            )}

            {v.estado === "pendiente_cobro" &&
              (cobrandoId === v.id ? (
                <div className="mt-2 flex gap-2">
                  <select className="vc-input flex-1" value={metodoCobro} onChange={(e) => setMetodoCobro(e.target.value)}>
                    {METODOS_COBRO.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <button
                    className="vc-btn-primary flex-shrink-0"
                    style={{ width: "auto" }}
                    disabled={procesando === v.id}
                    onClick={() => confirmarCobrado(v)}
                  >
                    {procesando === v.id ? "..." : "Confirmar"}
                  </button>
                </div>
              ) : (
                <button className="mt-2 text-xs font-medium text-teal hover:opacity-80" onClick={() => setCobrandoId(v.id)}>
                  Marcar cobrado
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}
