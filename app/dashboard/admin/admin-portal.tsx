"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Vendor = { id: string; name: string; active: boolean };

type AdminTier = "secretaria" | "administrador";

type Miembro = {
  id: string;
  member_email: string;
  member_name: string | null;
  permissions: Record<string, boolean> | null;
  active: boolean;
  vendor_id: string | null;
  accepted_at: string | null;
  vendors: { name: string } | null;
  admin_tier: AdminTier | null;
};

type Invitacion = {
  id: string;
  admin_name: string | null;
  admin_email: string;
  permissions: Record<string, boolean> | null;
  vendor_id: string | null;
  status: string;
  sent_at: string;
  invitation_token: string;
  admin_tier: AdminTier | null;
};

type Entidad = { id: string; name: string };

// Los 5 toggles que Joel prende/apaga por persona (mockup, 2 sept 2026).
// Los primeros 3 sí se hacen cumplir en RLS (migración 0054); los últimos
// 2 ('ver_ingresos_mes', 'ver_reportes_historicos') se guardan igual pero
// se hacen cumplir en la UI del portal de trabajo (Fase 2, ver tarea
// pendiente) — no hay forma limpia de separarlos en RLS porque leen de las
// mismas filas de invoices que el acceso base ya necesita.
const PERMISOS_ADICIONALES: { key: string; label: string }[] = [
  { key: "ver_ingresos_mes", label: "Ver total de ingresos del mes" },
  { key: "ver_gastos", label: "Ver gastos del negocio" },
  { key: "catalogo_precios", label: "Cambiar precios del catálogo" },
  { key: "ver_creditos_hacienda", label: "Ver créditos en Hacienda" },
  { key: "ver_reportes_historicos", label: "Ver reportes de años anteriores" },
];

// Nivel Administrador (migración 0056, 2 sept 2026, pedido de Joel: "tengo
// un Dr que su esposa es la adm y lleva todo el negocio... como se trabaja
// eso?") — $20/mes en vez de $10. Trae los 5 toggles de arriba siempre
// encendidos (por eso no se muestran como editables para este nivel) MÁS
// acceso a Pagos, Metas, Bóveda y Cuentas (solo ver balances) — nunca
// finanzas personales, en ningún nivel.
const PERMISOS_ADMINISTRADOR_TOTAL: Record<string, boolean> = {
  ver_ingresos_mes: true,
  ver_gastos: true,
  catalogo_precios: true,
  ver_creditos_hacienda: true,
  ver_reportes_historicos: true,
};

const NIVELES: { id: AdminTier; label: string; precio: string; descripcion: string }[] = [
  { id: "secretaria", label: "Secretaria", precio: "$10/mes", descripcion: "Facturación y clientes" },
  { id: "administrador", label: "Administrador", precio: "$20/mes", descripcion: "Todo — Pagos, Metas, Bóveda, Cuentas" },
];

const ACCESO_BASE = ["Clientes", "Crear facturas", "Registrar cobros", "Ver pendientes"];
const ACCESO_ADMINISTRADOR = ["Pagos a contratistas", "Metas de negocio", "Bóveda de documentos", "Cuentas (ver balances)"];

function iniciales(nombre: string | null, email: string): string {
  const base = nombre?.trim() || email;
  const partes = base.split(/[\s@.]+/).filter(Boolean);
  return (partes[0]?.[0] ?? "").toUpperCase() + (partes[1]?.[0] ?? "").toUpperCase() || base.slice(0, 2).toUpperCase();
}

// Item unificado: una tarjeta se ve igual sea un admin ya aceptado o una
// invitación todavía pendiente (mismo diseño del mockup) — solo cambian
// las acciones disponibles (toggle activo/inactivo y "ver su dashboard"
// no existen todavía para uno que no ha aceptado).
type ItemLista = {
  key: string;
  tipo: "miembro" | "invitacion";
  id: string;
  nombre: string | null;
  email: string;
  permissions: Record<string, boolean>;
  active: boolean;
  vendorId: string | null;
  vendorNombre: string | null;
  aceptada: boolean;
  adminTier: AdminTier;
};

export default function AdminPortal({
  vendors,
  miembros,
  invitaciones,
  entidad,
  vistaGlobalActiva,
  cantidadEntidades,
  addonActivo,
  addonSeats,
}: {
  vendors: Vendor[];
  miembros: Miembro[];
  invitaciones: Invitacion[];
  entidad: Entidad;
  vistaGlobalActiva: boolean;
  cantidadEntidades: number;
  addonActivo: boolean;
  addonSeats: number;
}) {
  const supabase = createClient();
  const router = useRouter();

  const itemsIniciales: ItemLista[] = useMemo(
    () => [
      ...miembros.map((m) => ({
        key: `m-${m.id}`,
        tipo: "miembro" as const,
        id: m.id,
        nombre: m.member_name,
        email: m.member_email,
        permissions: m.permissions ?? {},
        active: m.active,
        vendorId: m.vendor_id,
        vendorNombre: m.vendors?.name ?? null,
        aceptada: true,
        adminTier: (m.admin_tier as AdminTier) ?? "secretaria",
      })),
      ...invitaciones.map((inv) => ({
        key: `i-${inv.id}`,
        tipo: "invitacion" as const,
        id: inv.id,
        nombre: inv.admin_name,
        email: inv.admin_email,
        permissions: inv.permissions ?? {},
        active: true,
        vendorId: inv.vendor_id,
        vendorNombre: vendors.find((v) => v.id === inv.vendor_id)?.name ?? null,
        aceptada: false,
        adminTier: (inv.admin_tier as AdminTier) ?? "secretaria",
      })),
    ],
    [miembros, invitaciones, vendors]
  );

  const [items, setItems] = useState<ItemLista[]>(itemsIniciales);
  const [cambios, setCambios] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [tierInicialModal, setTierInicialModal] = useState<AdminTier>("secretaria");

  function abrirModalConTier(tier: AdminTier) {
    setTierInicialModal(tier);
    setModalAbierto(true);
  }
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null);

  const seatsActuales = items.length;
  const seatsSecretaria = items.filter((it) => it.adminTier !== "administrador").length;
  const seatsAdministrador = items.filter((it) => it.adminTier === "administrador").length;

  function marcarCambio(key: string) {
    setCambios((prev) => new Set(prev).add(key));
    setGuardado(false);
  }

  function togglePermiso(key: string, permKey: string) {
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, permissions: { ...it.permissions, [permKey]: !it.permissions[permKey] } } : it))
    );
    marcarCambio(key);
  }

  // Cambiar de Secretaria a Administrador enciende los 5 toggles de una vez
  // (no tiene caso dejarlos apagables para alguien con acceso total) — el
  // sentido contrario (Administrador → Secretaria) deja los toggles como
  // estaban, para que el dueño decida cuáles mantener encendidos.
  function cambiarTier(key: string, tier: AdminTier) {
    setItems((prev) =>
      prev.map((it) =>
        it.key === key
          ? { ...it, adminTier: tier, permissions: tier === "administrador" ? PERMISOS_ADMINISTRADOR_TOTAL : it.permissions }
          : it
      )
    );
    marcarCambio(key);
  }

  function toggleActivo(key: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, active: !it.active } : it)));
    marcarCambio(key);
  }

  async function sincronizarStripe() {
    await fetch("/api/stripe/addon-admin/sincronizar", { method: "POST" }).catch(() => null);
  }

  async function guardarConfiguracion() {
    setGuardando(true);
    setError(null);
    try {
      for (const it of items) {
        if (!cambios.has(it.key)) continue;
        if (it.tipo === "miembro") {
          const { error: updError } = await supabase
            .from("account_members")
            .update({ permissions: it.permissions, active: it.active, admin_tier: it.adminTier })
            .eq("id", it.id);
          if (updError) throw new Error(updError.message);
        } else {
          const { error: updError } = await supabase
            .from("admin_invitations")
            .update({ permissions: it.permissions, admin_tier: it.adminTier })
            .eq("id", it.id);
          if (updError) throw new Error(updError.message);
        }
      }
      setCambios(new Set());
      setGuardado(true);
      setGuardando(false);
      // Activar/desactivar un seat o cambiarle el nivel afecta la cantidad y
      // el precio en Stripe (Secretaria $10 vs. Administrador $20) — se
      // sincroniza siempre al guardar, no solo al invitar/borrar.
      await sincronizarStripe();
      router.refresh();
      setTimeout(() => setGuardado(false), 2500);
    } catch (err) {
      setGuardando(false);
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  async function eliminar(item: ItemLista) {
    if (confirmarBorrar !== item.key) {
      setConfirmarBorrar(item.key);
      return;
    }
    setError(null);
    const tabla = item.tipo === "miembro" ? "account_members" : "admin_invitations";
    const { error: delError } = await supabase.from(tabla).delete().eq("id", item.id);
    if (delError) {
      setError(delError.message);
      return;
    }
    setItems((prev) => prev.filter((it) => it.key !== item.key));
    setConfirmarBorrar(null);
    await sincronizarStripe();
    router.refresh();
  }

  async function vincularVendor(key: string, vendorId: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, vendorId, vendorNombre: vendors.find((v) => v.id === vendorId)?.name ?? null } : it)));
    const item = items.find((it) => it.key === key);
    if (!item) return;
    const tabla = item.tipo === "miembro" ? "account_members" : "admin_invitations";
    await supabase.from(tabla).update({ vendor_id: vendorId }).eq("id", item.id);
    router.refresh();
  }

  function alCrearInvitacion(nuevoItem: ItemLista) {
    setItems((prev) => [nuevoItem, ...prev]);
    setModalAbierto(false);
    sincronizarStripe();
    router.refresh();
  }

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-muted hover:opacity-80">
          ← VICTOR
        </Link>
      </div>

      <div className="mb-4 rounded-2xl border border-teal bg-teal/[.04] p-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium">Admin / Secretaria</p>
            <p className="text-xs text-muted">{entidad.name}</p>
          </div>
          <Link
            href={`/dashboard/entidades/${entidad.id}/editar`}
            className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-teal hover:opacity-80"
          >
            <i className="ti ti-settings" style={{ fontSize: 14 }} />
            Editar negocio
          </Link>
        </div>
      </div>

      {vistaGlobalActiva && cantidadEntidades > 1 && (
        <div className="mb-3 rounded-lg border border-amb/30 bg-amb/[.08] p-2.5 text-xs text-amb">
          Admin/Secretaria se administra por negocio, no en vista "Todas" — estás viendo <strong>{entidad.name}</strong>.
        </div>
      )}

      {error && <p className="mb-3 text-xs text-red">{error}</p>}

      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal/10">
            <i className="ti ti-shield-check text-2xl text-teal" />
          </div>
          <p className="mb-1 text-base font-medium">Añade un Admin/Secretaria</p>
          <p className="mb-4 text-xs text-muted">
            Dale acceso a tu secretaria o administrador para crear facturas y registrar cobros — sin ver tus
            finanzas personales ni el total del negocio.
          </p>
          <div className="mb-4 grid w-full max-w-md grid-cols-2 gap-2.5">
            <div className="flex flex-col rounded-xl border border-border p-3.5 text-left">
              <span className="text-xs font-medium">Secretaria</span>
              <span className="mb-1.5 text-sm font-medium">
                $10<span className="text-xs text-muted">/mes</span>
              </span>
              <p className="mb-3 flex-1 text-xs text-muted">Facturación, clientes y cobros.</p>
              <button
                className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs font-medium hover:opacity-80"
                onClick={() => abrirModalConTier("secretaria")}
              >
                <i className="ti ti-lock" style={{ fontSize: 12 }} /> Elegir
              </button>
            </div>
            <div className="flex flex-col rounded-xl border border-teal p-3.5 text-left">
              <span className="text-xs font-medium text-teal">Administrador</span>
              <span className="mb-1.5 text-sm font-medium">
                $20<span className="text-xs text-muted">/mes</span>
              </span>
              <p className="mb-3 flex-1 text-xs text-muted">Todo lo de Secretaria + Pagos, Metas, Bóveda y Cuentas.</p>
              <button
                className="flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-white hover:opacity-90"
                style={{ background: "#1D9E75" }}
                onClick={() => abrirModalConTier("administrador")}
              >
                <i className="ti ti-lock" style={{ fontSize: 12 }} /> Elegir
              </button>
            </div>
          </div>
          <ul className="flex flex-col gap-1 text-xs text-muted">
            <li>✓ Login propio — nunca tus credenciales</li>
            <li>✓ Permisos granulares por persona</li>
            <li>✓ Nunca tus finanzas personales</li>
          </ul>
        </div>
      ) : (
        <>
          <div className="mb-3 rounded-lg border border-border bg-bg p-2.5 text-xs text-muted">
            <i className="ti ti-info-circle" style={{ marginRight: 4 }} />
            Admin/Secretaria activo · {seatsSecretaria} secretaria{seatsSecretaria === 1 ? "" : "s"} ($
            {(seatsSecretaria * 10).toFixed(2)}) · {seatsAdministrador} administrador{seatsAdministrador === 1 ? "" : "es"} ($
            {(seatsAdministrador * 20).toFixed(2)}) · {seatsActuales} seat{seatsActuales === 1 ? "" : "s"} en total
          </div>
          <div className="mb-3 rounded-lg border border-teal/30 bg-teal/[.05] p-2.5 text-xs">
            Admins / Secretarias ven solo facturación — nunca tus finanzas personales ni el total del negocio, a
            menos que tú lo autorices.
          </div>

          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted">Admins / Secretarias</p>
            <button
              className="flex items-center gap-1 rounded-lg border border-teal px-2.5 py-1.5 text-xs font-medium text-teal"
              onClick={() => abrirModalConTier("secretaria")}
            >
              <i className="ti ti-plus" /> Añadir
            </button>
          </div>

          {items.map((item) => (
            <div key={item.key} className="vc-card mb-3">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal/15 text-xs font-medium text-teal">
                    {iniciales(item.nombre, item.email)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.nombre || item.email}</p>
                    <p className="truncate text-xs text-muted">
                      {item.email} · {item.aceptada ? "" : "Invitación pendiente · "}
                      {item.adminTier === "administrador" ? "Administrador" : "Secretaria"}
                    </p>
                  </div>
                </div>
                {item.aceptada && (
                  <button
                    onClick={() => toggleActivo(item.key)}
                    className="relative flex-shrink-0 rounded-pill"
                    style={{ width: 40, height: 22, background: item.active ? "#1D9E75" : "var(--border)" }}
                    title={item.active ? "Desactivar acceso" : "Activar acceso"}
                  >
                    <span
                      className="absolute top-0.5 rounded-full bg-white transition-all"
                      style={{ width: 18, height: 18, left: item.active ? 20 : 2 }}
                    />
                  </button>
                )}
              </div>

              <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">Nivel de acceso</p>
              <div className="mb-3 flex gap-1.5">
                {NIVELES.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => cambiarTier(item.key, n.id)}
                    className="flex-1 rounded-lg border px-2 py-1.5 text-left text-xs"
                    style={
                      item.adminTier === n.id
                        ? { borderColor: "#1D9E75", background: "rgba(29,158,117,.08)" }
                        : { borderColor: "var(--border)" }
                    }
                  >
                    <span className="block font-medium">
                      {n.label} <span className="text-muted">· {n.precio}</span>
                    </span>
                  </button>
                ))}
              </div>

              <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">Acceso base (siempre activo)</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {ACCESO_BASE.map((label) => (
                  <span key={label} className="rounded-pill bg-teal/10 px-2.5 py-1 text-[11px] font-medium text-teal">
                    {label}
                  </span>
                ))}
              </div>

              {item.adminTier === "administrador" && (
                <>
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-muted">Incluido en Administrador</p>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {ACCESO_ADMINISTRADOR.map((label) => (
                      <span key={label} className="rounded-pill bg-teal/10 px-2.5 py-1 text-[11px] font-medium text-teal">
                        {label}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">
                {item.adminTier === "administrador" ? "Permisos adicionales — todos incluidos" : "Permisos adicionales — tú controlas"}
              </p>
              <div className="mb-3 flex flex-col gap-2">
                {PERMISOS_ADICIONALES.map((p) => (
                  <div key={p.key} className="flex items-center justify-between gap-2">
                    <span className={`text-xs ${item.adminTier === "administrador" ? "text-muted" : ""}`}>{p.label}</span>
                    <button
                      disabled={item.adminTier === "administrador"}
                      onClick={() => togglePermiso(item.key, p.key)}
                      className="relative flex-shrink-0 rounded-pill disabled:opacity-70"
                      style={{ width: 36, height: 20, background: item.permissions[p.key] ? "#1D9E75" : "var(--border)" }}
                    >
                      <span
                        className="absolute top-0.5 rounded-full bg-white transition-all"
                        style={{ width: 16, height: 16, left: item.permissions[p.key] ? 18 : 2 }}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mb-3 rounded-lg border border-border bg-bg p-2.5">
                <p className="mb-0.5 text-[11px] uppercase tracking-wide text-muted">Acceso por email</p>
                <p className="text-xs text-teal">
                  {item.email} — {item.aceptada ? "acceso activo ✓" : "invitación enviada ✓"}
                </p>
              </div>

              <div className="mb-2 flex gap-2">
                <button
                  disabled
                  title="Próximamente"
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs font-medium text-muted opacity-50"
                >
                  <i className="ti ti-eye" /> Ver su dashboard
                </button>
                <button
                  onClick={() => eliminar(item)}
                  className={`flex flex-shrink-0 items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium ${
                    confirmarBorrar === item.key ? "border-red bg-red/[.06] text-red" : "border-border text-muted"
                  }`}
                >
                  <i className="ti ti-trash" /> {confirmarBorrar === item.key ? "¿Seguro?" : ""}
                </button>
              </div>

              {item.vendorId ? (
                <p className="text-[11px] text-muted">
                  <i className="ti ti-link text-teal" style={{ marginRight: 4 }} />
                  Vinculado a Pagos como <strong>{item.vendorNombre}</strong> — la retención se calcula igual que a
                  cualquier contratista.
                </p>
              ) : vendors.length > 0 ? (
                <div className="rounded-lg border border-dashed border-amb/40 bg-amb/[.05] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted">¿También le pagas por sus servicios?</span>
                    <select
                      className="rounded-md border border-border bg-card px-1.5 py-1 text-[11px]"
                      defaultValue=""
                      onChange={(e) => e.target.value && vincularVendor(item.key, e.target.value)}
                    >
                      <option value="" disabled>
                        Activar retención →
                      </option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          <div className="mb-3 rounded-lg border border-border bg-bg p-2.5 text-[11px] text-muted">
            Cada admin recibe un email de invitación. Entra con su propio correo y contraseña — nunca con las
            tuyas. Secretaria $10/mes · Administrador $20/mes.
          </div>

          <button className="vc-btn-primary w-full" disabled={guardando || cambios.size === 0} onClick={guardarConfiguracion}>
            {guardando ? "Guardando..." : guardado ? "Guardado ✓" : "Guardar configuración de admin"}
          </button>
        </>
      )}

      {modalAbierto && (
        <ModalAnadirAdmin
          vendors={vendors}
          entidadId={entidad.id}
          tierInicial={tierInicialModal}
          onCerrar={() => setModalAbierto(false)}
          onCreada={alCrearInvitacion}
        />
      )}
    </div>
  );
}

// ============================================================================
// Modal "Añadir admin/secretaria" — mockup 3: directorio de Pagos, nombre,
// email, rol (un solo valor por ahora), permisos adicionales.
// ============================================================================
function ModalAnadirAdmin({
  vendors,
  entidadId,
  tierInicial = "secretaria",
  onCerrar,
  onCreada,
}: {
  vendors: Vendor[];
  entidadId: string;
  tierInicial?: AdminTier;
  onCerrar: () => void;
  onCreada: (item: ItemLista) => void;
}) {
  const [origen, setOrigen] = useState<"directorio" | "nuevo">(vendors.length > 0 ? "directorio" : "nuevo");
  const [vendorId, setVendorId] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<AdminTier>(tierInicial);
  const [permisos, setPermisos] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function seleccionarVendor(id: string) {
    setVendorId(id);
    const v = vendors.find((x) => x.id === id);
    if (v) setNombre(v.name);
  }

  async function enviar() {
    if (!nombre.trim() || !email.trim() || !email.includes("@")) {
      setError("Completa el nombre y un correo válido.");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/admin-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityId: entidadId,
        adminName: nombre.trim(),
        adminEmail: email.trim(),
        vendorId: origen === "directorio" && vendorId ? vendorId : null,
        permissions: tier === "administrador" ? PERMISOS_ADMINISTRADOR_TOTAL : permisos,
        adminTier: tier,
      }),
    });
    const data = await res.json().catch(() => null);
    setEnviando(false);
    if (!res.ok || !data) {
      setError(data?.error ?? "No se pudo enviar la invitación.");
      return;
    }
    onCreada({
      key: `i-${data.invitationId}`,
      tipo: "invitacion",
      id: data.invitationId,
      nombre: nombre.trim(),
      email: email.trim(),
      permissions: tier === "administrador" ? PERMISOS_ADMINISTRADOR_TOTAL : permisos,
      active: true,
      vendorId: origen === "directorio" && vendorId ? vendorId : null,
      vendorNombre: vendors.find((v) => v.id === vendorId)?.name ?? null,
      aceptada: false,
      adminTier: tier,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCerrar}>
      <div className="vc-card w-full max-w-sm rounded-b-none sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-teal">Añadir admin / secretaria</p>
          <button onClick={onCerrar} className="text-muted">
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="mb-3 rounded-lg border border-teal/30 bg-teal/[.05] p-2.5 text-xs text-teal">
          <i className="ti ti-shield" style={{ marginRight: 4 }} />
          Tus finanzas personales nunca son visibles, en ningún nivel.
        </div>

        {error && <p className="mb-2 text-xs text-red">{error}</p>}

        <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Nivel de acceso</label>
        <div className="mb-3 flex gap-1.5">
          {NIVELES.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setTier(n.id)}
              className="flex-1 rounded-lg border px-2.5 py-2 text-left"
              style={tier === n.id ? { borderColor: "#1D9E75", background: "rgba(29,158,117,.08)" } : { borderColor: "var(--border)" }}
            >
              <span className="block text-xs font-medium">
                {n.label} <span className="text-muted">· {n.precio}</span>
              </span>
              <span className="block text-[11px] text-muted">{n.descripcion}</span>
            </button>
          ))}
        </div>

        {vendors.length > 0 && (
          <>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">¿Ya está en tu directorio?</label>
            <select
              className="vc-input mb-3"
              value={origen === "directorio" ? vendorId : ""}
              onChange={(e) => {
                if (e.target.value) {
                  setOrigen("directorio");
                  seleccionarVendor(e.target.value);
                } else {
                  setOrigen("nuevo");
                  setVendorId("");
                  setNombre("");
                }
              }}
            >
              <option value="">Es alguien nuevo</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </>
        )}

        <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Nombre completo</label>
        <input className="vc-input mb-3" placeholder="Laura Rivera" value={nombre} onChange={(e) => setNombre(e.target.value)} />

        <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Email de acceso</label>
        <input
          className="vc-input mb-1"
          placeholder="laura@clinica.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="mb-3 text-[11px] text-muted">Recibirá una invitación a este correo para crear su contraseña.</p>

        {tier === "administrador" ? (
          <>
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Incluye todo</p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {[...ACCESO_BASE, ...ACCESO_ADMINISTRADOR].map((label) => (
                <span key={label} className="rounded-pill bg-teal/10 px-2.5 py-1 text-[11px] font-medium text-teal">
                  {label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted">Permisos adicionales</p>
            <div className="mb-4 flex flex-col gap-2">
              {PERMISOS_ADICIONALES.map((p) => (
                <div key={p.key} className="flex items-center justify-between gap-2">
                  <span className="text-xs">{p.label}</span>
                  <button
                    onClick={() => setPermisos((prev) => ({ ...prev, [p.key]: !prev[p.key] }))}
                    className="relative flex-shrink-0 rounded-pill"
                    style={{ width: 36, height: 20, background: permisos[p.key] ? "#1D9E75" : "var(--border)" }}
                  >
                    <span
                      className="absolute top-0.5 rounded-full bg-white transition-all"
                      style={{ width: 16, height: 16, left: permisos[p.key] ? 18 : 2 }}
                    />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <button className="vc-btn-primary mb-2 flex w-full items-center justify-center gap-1" disabled={enviando} onClick={enviar}>
          <i className="ti ti-send" /> {enviando ? "Enviando..." : "Enviar invitación"}
        </button>
        <button className="w-full rounded-lg border border-border py-2.5 text-sm text-muted" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
