"use client";

import { useState } from "react";

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

    setSesion({ nombre: json.nombre });
    await cargarDatos();
    setLoading(false);
  }

  async function cargarDatos() {
    const res = await fetch("/api/socios/portal/me");
    const json = await res.json().catch(() => null);
    if (res.ok) setDatos(json);
  }

  async function salir() {
    await fetch("/api/socios/portal/logout", { method: "POST" });
    setSesion(null);
    setDatos(null);
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
