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

  useEffect(() => {
    fetch("/api/firma/activar")
      .then((r) => r.json())
      .then((d) => {
        setEsFirma(!!d.esFirmaAccountant);
        setSeatsActivos(d.seatsActivos ?? 0);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
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
    setSeatsActivos((n) => n + 1);
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
