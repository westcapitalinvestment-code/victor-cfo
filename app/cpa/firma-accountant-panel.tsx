"use client";

import { useEffect, useState } from "react";

// Panel del programa "Firma Accountant" dentro del Portal CPA (migración
// 0139, 4 oct 2026, diseñado con Joel a partir de su negocio de
// facturación médica — "bill my firm" de QuickBooks Online Accountant,
// pero con un solo plan y un solo % fijo).
//
// Dos estados:
//  1. El contador todavía no se activó — tarjeta con el pitch + form corto
//     (Registro de Comerciante obligatorio, Licencia de CPA opcional). Sin
//     aprobación de Joel, instantáneo (ver /api/firma/activar).
//  2. Ya activado — botón "Invitar cliente nuevo" que abre un modal
//     EXPLICATIVO primero (pedido explícito de Joel: "cuando la click ahi
//     debe explicar como funciona y el descuento aplicable solo en el plan
//     Business") y solo después deja escribir el email del cliente.
export default function FirmaAccountantPanel() {
  const [cargando, setCargando] = useState(true);
  const [esFirma, setEsFirma] = useState(false);
  const [seatsActivos, setSeatsActivos] = useState(0);

  const [registroComerciante, setRegistroComerciante] = useState("");
  const [licenciaCpa, setLicenciaCpa] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorActivar, setErrorActivar] = useState<string | null>(null);

  const [mostrarModal, setMostrarModal] = useState(false);
  const [email, setEmail] = useState("");
  const [nombreNegocio, setNombreNegocio] = useState("");
  const [invitando, setInvitando] = useState(false);
  const [errorInvitar, setErrorInvitar] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // Gestión de clientes bajo el plan (6 oct 2026, pedido de Joel: "de parte
  // del contable debe existir un boton para eliminar o manejar las cuentas
  // individuales para q no le sigan cobrando clientes que ya no tiene").
  type ClienteFirma = { id: string; email: string; nombre: string | null; desde: string };
  type PendienteFirma = { id: string; email: string; nombreNegocio: string | null; enviada: string };
  const [clientes, setClientes] = useState<ClienteFirma[]>([]);
  const [pendientes, setPendientes] = useState<PendienteFirma[]>([]);
  const [mostrarClientes, setMostrarClientes] = useState(false);
  const [accionEn, setAccionEn] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  async function cargarClientes() {
    const r = await fetch("/api/firma/clientes").catch(() => null);
    const d = await r?.json().catch(() => null);
    if (d) {
      setClientes(d.clientes ?? []);
      setPendientes(d.pendientes ?? []);
      setSeatsActivos((d.clientes?.length ?? 0) + (d.pendientes?.length ?? 0));
    }
  }

  async function liberar(c: ClienteFirma) {
    const nombre = c.nombre || c.email;
    if (
      !window.confirm(
        `¿Liberar a ${nombre}?\n\nDejarás de pagar su plan desde hoy. Él conserva Business y todos sus datos 30 días para continuar con su propio plan; si no lo hace, pasa al plan gratis. No se borra nada.`,
      )
    )
      return;
    setAccionEn(c.id);
    setErrorAccion(null);
    const res = await fetch("/api/firma/liberar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId: c.id }),
    });
    const json = await res.json().catch(() => null);
    setAccionEn(null);
    if (!res.ok) {
      setErrorAccion(json?.error || "No se pudo liberar al cliente.");
      return;
    }
    await cargarClientes();
  }

  async function cancelarInvitacion(p: PendienteFirma) {
    if (!window.confirm(`¿Cancelar la invitación a ${p.email}? Dejará de contar en tu factura.`)) return;
    setAccionEn(p.id);
    setErrorAccion(null);
    const res = await fetch("/api/firma/cancelar-invitacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitacionId: p.id }),
    });
    const json = await res.json().catch(() => null);
    setAccionEn(null);
    if (!res.ok) {
      setErrorAccion(json?.error || "No se pudo cancelar la invitación.");
      return;
    }
    await cargarClientes();
  }

  useEffect(() => {
    fetch("/api/firma/activar")
      .then((r) => r.json())
      .then((d) => {
        setEsFirma(!!d.esFirmaAccountant);
        setSeatsActivos(d.seatsActivos ?? 0);
        if (d.esFirmaAccountant) cargarClientes();
      })
      .catch(() => {})
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function activar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setErrorActivar(null);

    const res = await fetch("/api/firma/activar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registroComerciante, licenciaCpa }),
    });
    const json = await res.json().catch(() => null);
    setGuardando(false);

    if (!res.ok) {
      setErrorActivar(json?.error || "No se pudo activar. Intenta de nuevo.");
      return;
    }
    setEsFirma(true);
  }

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    setInvitando(true);
    setErrorInvitar(null);
    setExito(null);

    const res = await fetch("/api/firma/invitar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nombreNegocio }),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      setInvitando(false);
      setErrorInvitar(json?.error || "No se pudo mandar la invitación.");
      return;
    }

    if (json.requierePago && json.checkoutUrl) {
      // Primer cliente de esta Firma — hay que registrar tarjeta antes de
      // que exista correo que mandar (ver /api/firma/invitar).
      window.location.href = json.checkoutUrl;
      return;
    }

    setInvitando(false);
    setMostrarModal(false);
    setExito(`Invitación enviada a ${email}.`);
    setEmail("");
    setNombreNegocio("");
    cargarClientes();
  }

  if (cargando) return null;

  return (
    <div className="vc-card mb-4">
      {!esFirma ? (
        <>
          <p className="mb-1 text-sm font-medium">Hazte VICTOR Accountant</p>
          <p className="mb-3 text-xs text-muted">
            Regala el plan Business a tus clientes nuevos — tú pagas 40% menos ($60/mes en vez de $99.99, precio de lanzamiento el primer año) y
            decides si se lo cobras, lo incluyes en tu iguala, o lo regalas. El cliente usa su cuenta de VICTOR
            todos los días; la mensualidad la ves tú, no él.
          </p>
          {errorActivar && <p className="mb-2 text-xs text-red">{errorActivar}</p>}
          <form onSubmit={activar} className="flex flex-col gap-2">
            <input
              className="vc-input"
              placeholder="Registro de Comerciante"
              value={registroComerciante}
              onChange={(e) => setRegistroComerciante(e.target.value)}
              required
            />
            <input
              className="vc-input"
              placeholder="Licencia de CPA (opcional)"
              value={licenciaCpa}
              onChange={(e) => setLicenciaCpa(e.target.value)}
            />
            <button type="submit" className="vc-btn-primary" disabled={guardando}>
              {guardando ? "Activando..." : "Activar VICTOR Accountant"}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">VICTOR Accountant</p>
              <p className="text-xs text-muted">
                {seatsActivos > 0
                  ? `${seatsActivos} cliente${seatsActivos === 1 ? "" : "s"} activo${seatsActivos === 1 ? "" : "s"} bajo tu plan.`
                  : "Todavía no has invitado a ningún cliente."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMostrarModal(true)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-teal px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              <i className="ti ti-user-plus text-sm" /> Invitar cliente nuevo
            </button>
          </div>
          {exito && <p className="mt-2 text-xs text-teal">{exito}</p>}

          {(clientes.length > 0 || pendientes.length > 0) && (
            <div className="mt-3 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setMostrarClientes((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-medium text-muted"
              >
                <span>Administrar clientes bajo tu plan ({clientes.length + pendientes.length})</span>
                <i className={`ti ${mostrarClientes ? "ti-chevron-up" : "ti-chevron-down"}`} />
              </button>

              {mostrarClientes && (
                <div className="mt-2 flex flex-col divide-y divide-border">
                  {errorAccion && <p className="mb-2 text-xs text-red">{errorAccion}</p>}
                  {clientes.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.nombre || c.email}</p>
                        <p className="truncate text-xs text-muted">{c.nombre ? c.email : "Cliente activo"}</p>
                      </div>
                      <button
                        type="button"
                        disabled={accionEn === c.id}
                        onClick={() => liberar(c)}
                        className="flex-shrink-0 whitespace-nowrap rounded-full border border-red px-3 py-1 text-xs font-medium text-red hover:opacity-80"
                      >
                        {accionEn === c.id ? "Liberando..." : "Liberar"}
                      </button>
                    </div>
                  ))}
                  {pendientes.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.nombreNegocio || p.email}</p>
                        <p className="truncate text-xs text-muted">Invitación pendiente · {p.email}</p>
                      </div>
                      <button
                        type="button"
                        disabled={accionEn === p.id}
                        onClick={() => cancelarInvitacion(p)}
                        className="flex-shrink-0 whitespace-nowrap rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:opacity-80"
                      >
                        {accionEn === p.id ? "Cancelando..." : "Cancelar"}
                      </button>
                    </div>
                  ))}
                  <p className="pt-2 text-[11px] text-muted">
                    Al liberar a un cliente dejas de pagar su plan desde hoy. Él conserva Business y todos sus datos 30 días
                    para continuar con su propio plan; después pasa al plan gratis. No se borra nada.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {mostrarModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => setMostrarModal(false)}
        >
          <div className="vc-card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-sm font-medium">Cómo funciona</p>
            <p className="mb-3 text-xs text-muted">
              El plan Business de tu cliente ($99.99/mes de lista) queda incluido en TU factura, con 40% de
              descuento ($60/mes, precio de lanzamiento el primer año) — nunca se le cobra nada a él por el plan base. El descuento aplica SOLO al plan
              Business; si tu cliente activa un addon después (Técnicos, Administrador, Entidades adicionales o
              Pagos), eso se factura aparte, directo a él, a precio normal. Si es tu primer cliente, te vamos a
              pedir que registres una tarjeta para esta suscripción — de ahí en adelante, cada cliente nuevo solo
              se suma, sin volver a pedírtela.
            </p>
            {errorInvitar && <p className="mb-2 text-xs text-red">{errorInvitar}</p>}
            <form onSubmit={invitar} className="flex flex-col gap-2">
              <input
                className="vc-input"
                type="email"
                placeholder="Email del cliente"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                className="vc-input"
                placeholder="Nombre del negocio (opcional)"
                value={nombreNegocio}
                onChange={(e) => setNombreNegocio(e.target.value)}
              />
              <button type="submit" className="vc-btn-primary" disabled={invitando}>
                {invitando ? "Enviando..." : "Invitar"}
              </button>
              <button
                type="button"
                className="text-center text-xs text-muted underline"
                onClick={() => setMostrarModal(false)}
              >
                Cancelar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
