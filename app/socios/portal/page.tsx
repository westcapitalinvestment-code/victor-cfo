"use client";

import { useEffect, useState } from "react";

const SITE_URL = "https://www.victorcfo.com";

// Portal público del vendedor (Programa de Socios, modelo 70/30, migración
// 0107, 29 sept 2026) — mismo patrón que /tecnico: entra con código corto +
// PIN, sin Supabase Auth (ver lib/socio-session.ts). Fuera de
// /dashboard a propósito, así que no pasa por PinGate/Topbar/BottomNav.
//
// Solo muestra SUS PROPIOS datos: clientes que trajo, estado de cada uno,
// cuánto ya cobró y cuánto tiene pendiente — NUNCA el ingreso que le genera
// a WCV ni nada de la economía de la empresa (eso solo lo ve Joel en
// app/dashboard/cfo/socios-panel.tsx).

type ClienteFila = {
  id: string;
  nombre: string | null;
  plan: string | null;
  registradoEn: string | null;
  estado: "trial" | "generando_comision" | "cerrado_cobrado" | "cerrado_perdido";
  ciclo: "mensual" | "anual" | null;
  cobradoCentavos: number;
  pendienteCentavos: number;
  retenidoCentavos: number;
};

const ESTADO_LABEL: Record<ClienteFila["estado"], { texto: string; color: string }> = {
  trial: { texto: "En trial (30 días)", color: "text-muted" },
  generando_comision: { texto: "Generando comisión", color: "text-amb" },
  cerrado_cobrado: { texto: "Ciclo completo — cobrado", color: "text-teal" },
  cerrado_perdido: { texto: "Cliente canceló — perdido", color: "text-red" },
};

// Prospectos (migración 0150, 13 oct 2026) — contactos a los que el vendedor
// le presentó VICTOR. Si se registran con ese email/teléfono dentro de 60
// días (por cualquier vía, también por la landing), la comisión es del
// vendedor. Aquí además es su herramienta de seguimiento: llamar o escribir
// por WhatsApp directo desde la lista.
type Prospecto = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  notas: string | null;
  estado: "vigente" | "convertido" | "vencido" | "otro_vendedor";
  diasRestantes: number | null;
  creadoEn: string;
  convertidoEn: string | null;
};

const PROSPECTO_ESTADO: Record<Prospecto["estado"], { texto: string; color: string }> = {
  vigente: { texto: "Vigente", color: "text-amb" },
  convertido: { texto: "Se registró ✓", color: "text-teal" },
  vencido: { texto: "Venció", color: "text-muted" },
  otro_vendedor: { texto: "No aplicó", color: "text-muted" },
};

function fmtTel(d: string) {
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function fmt(centavos: number) {
  return `$${(centavos / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("es-PR", { timeZone: "America/Puerto_Rico", day: "numeric", month: "short", year: "numeric" })
    : "—";
}

export default function SocioPortalPage() {
  const [sesion, setSesion] = useState<{ nombre: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [datos, setDatos] = useState<{
    totalCobradoCentavos: number;
    totalPendienteCentavos: number;
    totalRetenidoCentavos: number;
    clientes: ClienteFila[];
  } | null>(null);
  const [prospectos, setProspectos] = useState<Prospecto[] | null>(null);
  const [pNombre, setPNombre] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pTelefono, setPTelefono] = useState("");
  const [pNotas, setPNotas] = useState("");
  const [pGuardando, setPGuardando] = useState(false);
  const [pError, setPError] = useState<string | null>(null);
  // Link personal + QR (13 oct 2026): el correo de aprobación puede caer en
  // Junk y bloquear el adjunto, así que el QR también vive aquí, descargable.
  const [codigoSocio, setCodigoSocio] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const linkPersonal = codigoSocio ? `${SITE_URL}/registro?socio=${codigoSocio}` : "";

  useEffect(() => {
    if (!linkPersonal) {
      setQrUrl(null);
      return;
    }
    let cancelado = false;
    import("qrcode")
      .then((QR) => QR.toDataURL(linkPersonal, { width: 480, margin: 2 }))
      .then((url) => {
        if (!cancelado) setQrUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [linkPersonal]);

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(linkPersonal);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin permiso de portapapeles: el link igual está visible */
    }
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!codigo.trim() || !/^\d{4}$/.test(pin)) {
      setError("Completa tu código y tu PIN de 4 dígitos.");
      return;
    }
    setLoading(true);
    setError(null);

    const res = await fetch("/api/socios/portal/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: codigo.trim(), pin }),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      setLoading(false);
      setError(json?.error || "No se pudo iniciar sesión.");
      return;
    }

    setCodigoSocio(codigo.trim().toUpperCase());
    setSesion({ nombre: json.nombre });
    await cargarDatos();
    setLoading(false);
  }

  async function cargarDatos() {
    const [res, resP] = await Promise.all([fetch("/api/socios/portal/me"), fetch("/api/socios/portal/prospectos")]);
    const json = await res.json().catch(() => null);
    if (res.ok) setDatos(json);
    const jsonP = await resP.json().catch(() => null);
    if (resP.ok) setProspectos(jsonP.prospectos ?? []);
  }

  async function agregarProspecto(e: React.FormEvent) {
    e.preventDefault();
    setPError(null);
    if (pNombre.trim().length < 2) {
      setPError("Escribe el nombre del prospecto.");
      return;
    }
    if (!pEmail.trim() && !pTelefono.trim()) {
      setPError("Pon al menos un email o un teléfono.");
      return;
    }
    setPGuardando(true);
    const res = await fetch("/api/socios/portal/prospectos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: pNombre, email: pEmail, telefono: pTelefono, notas: pNotas }),
    });
    const json = await res.json().catch(() => null);
    setPGuardando(false);
    if (!res.ok) {
      setPError(json?.error || "No se pudo guardar el prospecto.");
      return;
    }
    setPNombre("");
    setPEmail("");
    setPTelefono("");
    setPNotas("");
    await cargarDatos();
  }

  async function borrarProspecto(id: string) {
    if (!window.confirm("¿Quitar este prospecto? Perderás la protección de 60 días sobre este contacto.")) return;
    const res = await fetch("/api/socios/portal/prospectos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) await cargarDatos();
  }

  async function salir() {
    await fetch("/api/socios/portal/logout", { method: "POST" });
    setSesion(null);
    setDatos(null);
    setProspectos(null);
    setCodigoSocio("");
    setCodigo("");
    setPin("");
  }

  if (!sesion) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-2">
            <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
            <span className="text-lg font-medium">VICTOR</span>
          </div>

          <form onSubmit={entrar} className="vc-card flex flex-col gap-3">
            <h1 className="mb-1 text-base font-medium">Portal de vendedor</h1>
            <p className="mb-1 text-xs text-muted">Entra con tu código y tu PIN de 4 dígitos para ver tus clientes y tus comisiones.</p>

            {error && <p className="text-xs text-red">{error}</p>}

            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Tu código"
              className="rounded-lg border border-border p-2.5 text-sm"
              autoCapitalize="characters"
            />
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="PIN (4 dígitos)"
              inputMode="numeric"
              maxLength={4}
              className="rounded-lg border border-border p-2.5 text-center text-lg tracking-[0.5em]"
            />

            <button type="submit" disabled={loading} className="rounded-pill bg-teal p-2.5 text-sm font-medium text-white">
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-base font-medium">Hola, {sesion.nombre}</p>
          <p className="text-xs text-muted">Tus clientes y tus comisiones</p>
        </div>
        <button onClick={salir} className="rounded-pill border border-border px-2.5 py-1 text-[11px] font-medium text-muted">
          Salir
        </button>
      </div>

      {!datos ? (
        <p className="py-8 text-center text-sm text-muted">Cargando...</p>
      ) : (
        <>
          <div className="mb-2 flex gap-2">
            <div className="vc-card flex-1 text-center">
              <p className="text-[11px] text-muted">Ya cobrado</p>
              <p className="text-lg font-semibold text-teal">{fmt(datos.totalCobradoCentavos)}</p>
            </div>
            <div className="vc-card flex-1 text-center">
              <p className="text-[11px] text-muted">Pendiente</p>
              <p className="text-lg font-semibold text-amb">{fmt(datos.totalPendienteCentavos)}</p>
            </div>
          </div>

          {datos.totalRetenidoCentavos > 0 && (
            <div className="vc-card mb-4 text-[11px] text-muted">
              Se te retuvo <span className="font-medium text-muted">{fmt(datos.totalRetenidoCentavos)}</span> en total
              (Sección 1062.03 de Hacienda) — los montos de arriba ya son netos, después de esa retención.
            </div>
          )}

          {/* Link personal + QR: para enseñarlo en persona o compartirlo */}
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Tu link y tu QR</p>
          <div className="vc-card mb-4 flex flex-col items-center gap-2 text-center">
            <p className="text-[11px] text-muted">
              Cualquier negocio que se registre por este link o este QR queda conectado a ti automáticamente.
            </p>
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt={`QR de ${codigoSocio}`} width={200} height={200} className="rounded-lg bg-white" />
            ) : (
              <div className="flex h-[200px] w-[200px] items-center justify-center text-[11px] text-muted">Generando QR…</div>
            )}
            <p className="text-sm font-semibold tracking-wide">{codigoSocio}</p>
            <p className="break-all text-[11px] text-muted">{linkPersonal}</p>
            <div className="flex gap-2">
              <button type="button" onClick={copiarLink} className="rounded-pill border border-border px-3 py-1.5 text-[12px] font-medium">
                {copiado ? "Copiado ✓" : "Copiar link"}
              </button>
              {qrUrl && (
                <a
                  href={qrUrl}
                  download={`qr-${codigoSocio}.png`}
                  className="rounded-pill bg-teal px-3 py-1.5 text-[12px] font-medium text-white"
                >
                  Descargar QR
                </a>
              )}
            </div>
          </div>

          {/* Prospectos: protege tu comisión si el cliente se registra después
              por la landing, y te deja dar seguimiento (llamar / WhatsApp). */}
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            Tus prospectos {prospectos ? `(${prospectos.length})` : ""}
          </p>
          <form onSubmit={agregarProspecto} className="vc-card mb-3 flex flex-col gap-2">
            <p className="text-[11px] text-muted">
              Registra a quien le presentaste VICTOR. Si se registra con ese email o teléfono en los próximos 60 días, por
              donde sea, la venta es tuya.
            </p>
            {pError && <p className="text-xs text-red">{pError}</p>}
            <input
              value={pNombre}
              onChange={(e) => setPNombre(e.target.value)}
              placeholder="Nombre (persona o negocio)"
              className="rounded-lg border border-border p-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                value={pEmail}
                onChange={(e) => setPEmail(e.target.value)}
                placeholder="Email"
                type="email"
                inputMode="email"
                className="w-1/2 rounded-lg border border-border p-2 text-sm"
              />
              <input
                value={pTelefono}
                onChange={(e) => setPTelefono(e.target.value)}
                placeholder="Teléfono"
                type="tel"
                inputMode="tel"
                className="w-1/2 rounded-lg border border-border p-2 text-sm"
              />
            </div>
            <input
              value={pNotas}
              onChange={(e) => setPNotas(e.target.value)}
              placeholder="Nota (opcional)"
              className="rounded-lg border border-border p-2 text-sm"
            />
            <button type="submit" disabled={pGuardando} className="rounded-pill bg-teal p-2 text-sm font-medium text-white">
              {pGuardando ? "Guardando..." : "Registrar prospecto"}
            </button>
          </form>

          {prospectos && prospectos.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {prospectos.map((p) => {
                const info = PROSPECTO_ESTADO[p.estado];
                return (
                  <div key={p.id} className="vc-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.nombre}</p>
                        <p className="truncate text-[11px] text-muted">
                          {[p.email, p.telefono ? fmtTel(p.telefono) : null].filter(Boolean).join(" · ")}
                        </p>
                        {p.notas && <p className="mt-0.5 text-[11px] text-muted">{p.notas}</p>}
                      </div>
                      <span className={`shrink-0 text-[11px] font-medium ${info.color}`}>
                        {info.texto}
                        {p.estado === "vigente" && p.diasRestantes !== null ? ` · ${p.diasRestantes} d` : ""}
                      </span>
                    </div>
                    {p.estado === "vigente" && (
                      <div className="mt-2 flex flex-wrap gap-3 border-t border-border pt-2 text-[12px]">
                        {p.telefono && (
                          <a href={`tel:+1${p.telefono}`} className="font-medium text-teal">
                            Llamar
                          </a>
                        )}
                        {p.telefono && (
                          <a
                            href={`https://wa.me/1${p.telefono}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-teal"
                          >
                            WhatsApp
                          </a>
                        )}
                        {p.email && (
                          <a href={`mailto:${p.email}`} className="font-medium text-teal">
                            Email
                          </a>
                        )}
                        <button type="button" onClick={() => borrarProspecto(p.id)} className="ml-auto text-muted">
                          Quitar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            Tus clientes ({datos.clientes.length})
          </p>

          {datos.clientes.length === 0 ? (
            <div className="vc-card text-center text-sm text-muted">Todavía no tienes clientes registrados con tu código.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {datos.clientes.map((c) => {
                const estadoInfo = ESTADO_LABEL[c.estado];
                return (
                  <div key={c.id} className="vc-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.nombre || "Cliente"}</p>
                        <p className="text-[11px] text-muted">
                          Desde {fmtFecha(c.registradoEn)}
                          {c.ciclo ? ` · ${c.ciclo}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[11px] font-medium ${estadoInfo.color}`}>{estadoInfo.texto}</span>
                    </div>
                    {(c.cobradoCentavos > 0 || c.pendienteCentavos > 0) && (
                      <div className="mt-2 flex gap-4 border-t border-border pt-2 text-[12px]">
                        {c.cobradoCentavos > 0 && (
                          <span>
                            Cobrado: <span className="font-medium text-teal">{fmt(c.cobradoCentavos)}</span>
                          </span>
                        )}
                        {c.pendienteCentavos > 0 && (
                          <span>
                            Pendiente: <span className="font-medium text-amb">{fmt(c.pendienteCentavos)}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
