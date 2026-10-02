"use client";

import { useMemo, useState } from "react";

// Panel de "Programa de Socios" del Dashboard de Operaciones (migración
// 0070/0071, 5 sept 2026) — mismo patrón que usuarios-panel.tsx: recibe los
// datos YA leídos desde el Server Component (app/dashboard/cfo/page.tsx) y
// solo maneja estado de UI + las acciones del founder (aprobar/suspender un
// socio, marcar una comisión como pagada, revelar banco/cuenta/ruta para
// hacer el ACH). El pago en sí es SIEMPRE manual — estos botones solo
// dejan constancia o te dan lo que necesitas para transferir por fuera de
// la app (Mercury).

export type SocioFila = {
  id: string;
  tipo: string;
  nombre: string;
  email: string;
  telefono: string | null;
  comoPromociona: string | null;
  codigo: string | null;
  estado: "pendiente" | "aprobado" | "suspendido";
  createdAt: string | null;
  paymentToken: string | null;
  datosPagoCompletados: boolean;
  bankName: string | null;
  accountLast4: string | null;
};

export type ComisionFila = {
  id: string;
  socioId: string;
  plan: string;
  comisionCentavos: number;
  estado: "pendiente" | "pagada" | "reversada";
  createdAt: string | null;
};

// Estado por cliente de un vendedor — el founder lo usa para el desglose
// por vendedor: cuántos clientes, en qué estado, y cuánto ingreso mensual
// bruto le generan a WCV, para comparar contra la comisión pagada.
//
// Dos modelos conviven aquí según el CICLO del cliente (migración 0135, 2
// oct 2026 — "se mantiene el 70/30 pq me deja cashflow para operar"):
//   - 'setenta_treinta' (ciclo mensual, igual que la 0107 original):
//     setentaCentavos+treintaCentavos = el precio mensual completo del
//     cliente — ahí SÍ es también la comisión total que se le paga al
//     vendedor (70% ahora + 30% al 3er pago real).
//   - 'unico' (ciclo anual): setentaCentavos = la comisión REAL pagada
//     (20% del año, una sola vez) — ya NO equivale al ingreso real de WCV
//     (que es el 100% del año), así que para el ingreso bruto hay que usar
//     montoBaseCentavos (el monto completo que pagó el cliente) en vez de
//     la comisión.
export type VendedorClienteFila = {
  id: string;
  socioId: string;
  ciclo: "mensual" | "anual";
  modelo: "setenta_treinta" | "unico";
  primerPagoAt: string | null;
  setentaCentavos: number;
  treintaCentavos: number;
  treintaEstado: "pendiente" | "liberada" | "perdida";
  montoBaseCentavos: number | null;
};

// Ingreso mensual bruto REAL que un cliente de vendedor le genera a WCV —
// no la comisión que se le paga al vendedor por él. Ver el comentario del
// tipo VendedorClienteFila arriba para por qué los dos modelos se calculan
// distinto.
function ingresoMensualDeCliente(v: VendedorClienteFila): number {
  if (v.modelo === "unico") {
    const montoReal = v.montoBaseCentavos ?? v.setentaCentavos;
    return v.ciclo === "anual" ? Math.round(montoReal / 12) : montoReal;
  }
  // Modelo viejo: setenta+treinta siempre suma el monto base mensual
  // equivalente completo, sea mensual o anual.
  return v.setentaCentavos + v.treintaCentavos;
}

const TIPO_LABEL: Record<string, string> = {
  cpa: "CPA/Contador",
  influencer: "Influencer",
  otro: "Otro",
  vendedor: "Vendedor",
};

function fmt(centavos: number) {
  return `$${(centavos / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("es-PR", { timeZone: "America/Puerto_Rico", day: "numeric", month: "short", year: "numeric" })
    : "—";
}

// Umbral real de Hacienda PR (Sección 1062.03) sobre pagos por servicios a
// un mismo socio en el año calendario — corregido 30 sept 2026 (mismo fix
// que pagos-portal.tsx: un solo umbral de $500, no dos umbrales separados
// de $500/$1,500 — ese segundo número no existe en la ley, confirmado con
// el CPA de Joel). A partir de $500 acumulado hay que declararlo en el
// Modelo 480.6SP; el exceso sobre $500 queda sujeto a retención (Joel
// nunca retiene aquí en v1 — el pago es efectivo real, no pasa por Stripe
// balance, así que esto solo AVISA). No se guarda SSN/EIN todavía (fuera
// de alcance de v1); Joel resuelve la recolección de datos contributivos
// y la 480.6SP por fuera de la app en ese momento (ver migración 0070/0071).
const UMBRAL_DECLARAR_CENTAVOS = 50_000; // $500 — declarar en 480.6SP

export default function SociosPanel({
  socios: sociosIniciales,
  comisiones: comisionesIniciales,
  vendedorClientes = [],
}: {
  socios: SocioFila[];
  comisiones: ComisionFila[];
  vendedorClientes?: VendedorClienteFila[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [socios, setSocios] = useState(sociosIniciales);
  const [comisiones, setComisiones] = useState(comisionesIniciales);
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [datosRevelados, setDatosRevelados] = useState<
    Record<string, { bankName: string; accountNumber: string; routingNumber: string } | "cargando" | "error">
  >({});

  const pendientes = socios.filter((s) => s.estado === "pendiente");
  const aprobados = socios.filter((s) => s.estado === "aprobado");
  const suspendidos = socios.filter((s) => s.estado === "suspendido");

  const comisionesPorSocio = useMemo(() => {
    const mapa = new Map<string, ComisionFila[]>();
    for (const c of comisiones) {
      const lista = mapa.get(c.socioId) ?? [];
      lista.push(c);
      mapa.set(c.socioId, lista);
    }
    return mapa;
  }, [comisiones]);

  const vendedorClientesPorSocio = useMemo(() => {
    const mapa = new Map<string, VendedorClienteFila[]>();
    for (const v of vendedorClientes) {
      const lista = mapa.get(v.socioId) ?? [];
      lista.push(v);
      mapa.set(v.socioId, lista);
    }
    return mapa;
  }, [vendedorClientes]);

  async function actualizarSocio(id: string, estado: "aprobado" | "suspendido") {
    setCargando(id);
    setError(null);
    const res = await fetch(`/api/socios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    const json = await res.json().catch(() => null);
    setCargando(null);
    if (!res.ok) {
      setError(json?.error || "No se pudo actualizar el socio.");
      return;
    }
    setSocios((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, estado, codigo: json?.codigo ?? s.codigo, paymentToken: json?.paymentToken ?? s.paymentToken } : s
      )
    );
  }

  async function marcarPagada(id: string) {
    setCargando(id);
    setError(null);
    const res = await fetch(`/api/socios/comisiones/${id}`, { method: "PATCH" });
    const json = await res.json().catch(() => null);
    setCargando(null);
    if (!res.ok) {
      setError(json?.error || "No se pudo marcar como pagada.");
      return;
    }
    setComisiones((prev) => prev.map((c) => (c.id === id ? { ...c, estado: "pagada" } : c)));
  }

  async function copiarLink(texto: string, id: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Sin permiso de portapapeles — Joel puede seleccionar el texto a mano.
    }
  }

  async function revelarDatosPago(id: string) {
    setDatosRevelados((prev) => ({ ...prev, [id]: "cargando" }));
    const res = await fetch(`/api/socios/${id}/datos-pago`);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setDatosRevelados((prev) => ({ ...prev, [id]: "error" }));
      return;
    }
    setDatosRevelados((prev) => ({
      ...prev,
      [id]: { bankName: json.bankName, accountNumber: json.accountNumber, routingNumber: json.routingNumber },
    }));
  }

  const inicioAño = new Date(`${new Date().getFullYear()}-01-01T00:00:00-04:00`);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.victorcfo.com";

  return (
    <div className="vc-card mb-3">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
          Programa de Socios ({aprobados.length} activos{pendientes.length > 0 ? `, ${pendientes.length} pendientes` : ""})
        </p>
        <span className="shrink-0 text-[11px] text-muted">{abierto ? "Ocultar ▲" : "Ver ▼"}</span>
      </button>

      {abierto && (
        <div className="mt-3 flex flex-col gap-4">
          {error && <p className="text-xs text-red">{error}</p>}

          {/* Solicitudes pendientes de revisar */}
          {pendientes.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-amb">Pendientes de revisar</p>
              <div className="flex flex-col gap-2">
                {pendientes.map((s) => (
                  <div key={s.id} className="rounded-lg border border-border p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.nombre} <span className="text-[11px] text-muted">· {TIPO_LABEL[s.tipo] ?? s.tipo}</span></p>
                        <p className="truncate text-[11px] text-muted">{s.email}{s.telefono ? ` · ${s.telefono}` : ""}</p>
                        {s.comoPromociona && <p className="mt-1 text-[11px] text-muted">&quot;{s.comoPromociona}&quot;</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => actualizarSocio(s.id, "aprobado")}
                          disabled={cargando === s.id}
                          className="rounded-pill border border-teal px-2 py-1 text-[11px] font-medium text-teal"
                        >
                          {cargando === s.id ? "..." : "Aprobar"}
                        </button>
                        <button
                          onClick={() => actualizarSocio(s.id, "suspendido")}
                          disabled={cargando === s.id}
                          className="rounded-pill border border-red px-2 py-1 text-[11px] font-medium text-red"
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Socios activos — código + link de pago, comisiones pendientes/pagadas y alerta de 1062.03 */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Socios activos</p>
            {aprobados.length === 0 ? (
              <p className="py-2 text-center text-sm text-muted">Ninguno aprobado todavía.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {aprobados.map((s) => {
                  const propias = comisionesPorSocio.get(s.id) ?? [];
                  const pendiente = propias.filter((c) => c.estado === "pendiente");
                  const pagadasEsteAño = propias.filter(
                    (c) => c.estado === "pagada" && c.createdAt && new Date(c.createdAt) >= inicioAño
                  );
                  const totalPendiente = pendiente.reduce((sum, c) => sum + c.comisionCentavos, 0);
                  const acumuladoEsteAño =
                    pagadasEsteAño.reduce((sum, c) => sum + c.comisionCentavos, 0) +
                    propias
                      .filter((c) => c.estado === "pendiente" && c.createdAt && new Date(c.createdAt) >= inicioAño)
                      .reduce((sum, c) => sum + c.comisionCentavos, 0);
                  const pasoDeclarar = acumuladoEsteAño >= UMBRAL_DECLARAR_CENTAVOS;
                  const linkPago = s.paymentToken ? `${origin}/socios/pago/${s.paymentToken}` : null;
                  const revelado = datosRevelados[s.id];

                  return (
                    <div key={s.id} className="rounded-lg border border-border p-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {s.nombre} <span className="text-[11px] text-muted">· {TIPO_LABEL[s.tipo] ?? s.tipo}</span>
                          </p>
                          <p className="truncate text-[11px] text-muted">
                            {s.email} · código <span className="font-mono">{s.codigo ?? "—"}</span>
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] text-muted">Pendiente</p>
                          <p className="font-medium">{fmt(totalPendiente)}</p>
                        </div>
                      </div>

                      {/* Datos de pago: si no los ha llenado, dale el link para mandarle;
                          si ya los llenó, muestra ···last4 con opción de revelar completo. */}
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
                        {s.datosPagoCompletados ? (
                          <span className="text-muted">
                            🏦 {s.bankName ?? "Banco"} ···{s.accountLast4}
                          </span>
                        ) : (
                          <span className="text-amb">⚠️ Falta que llene sus datos de pago</span>
                        )}
                        <div className="flex shrink-0 gap-1">
                          {!s.datosPagoCompletados && linkPago && (
                            <button
                              onClick={() => copiarLink(linkPago, `pago-${s.id}`)}
                              className="rounded-pill border border-border px-2 py-0.5 font-medium text-muted"
                            >
                              {copiado === `pago-${s.id}` ? "¡Copiado!" : "Copiar link de pago"}
                            </button>
                          )}
                          {s.datosPagoCompletados && !revelado && (
                            <button
                              onClick={() => revelarDatosPago(s.id)}
                              className="rounded-pill border border-border px-2 py-0.5 font-medium text-muted"
                            >
                              Ver cuenta completa
                            </button>
                          )}
                        </div>
                      </div>

                      {revelado === "cargando" && <p className="mt-1 text-[11px] text-muted">Descifrando...</p>}
                      {revelado === "error" && <p className="mt-1 text-[11px] text-red">No se pudo cargar.</p>}
                      {revelado && typeof revelado === "object" && (
                        <div className="mt-1.5 rounded-md bg-teal/5 px-2 py-1.5 text-[11px]">
                          <p>Banco: {revelado.bankName}</p>
                          <p>Routing: <span className="font-mono">{revelado.routingNumber}</span></p>
                          <p>Cuenta: <span className="font-mono">{revelado.accountNumber}</span></p>
                        </div>
                      )}

                      {pasoDeclarar && (
                        <p className="mt-1.5 rounded-md bg-amb/10 px-2 py-1 text-[11px] text-amb">
                          ⚠️ Lleva {fmt(acumuladoEsteAño)} este año — pasó los $500 de la Sección 1062.03. Hay que
                          declararlo en el Modelo 480.6SP; el exceso sobre $500 queda sujeto a retención. Pide datos
                          contributivos antes de seguir pagando (fuera de la app).
                        </p>
                      )}

                      {/* Desglose por vendedor (modelo 70/30, migración 0107, 29 sept
                          2026) — SOLO el founder ve esto: cuántos clientes trajo, en qué
                          estado está cada uno, y el ingreso mensual bruto que le generan a
                          WCV vs. la comisión pagada/pendiente. El vendedor mismo nunca ve
                          este desglose ni el ingreso de WCV — su portal (/socios/portal)
                          solo muestra su propia comisión. */}
                      {s.tipo === "vendedor" && (() => {
                        const clientesDeEsteVendedor = vendedorClientesPorSocio.get(s.id) ?? [];
                        if (clientesDeEsteVendedor.length === 0) return null;
                        const ingresoMensualBruto = clientesDeEsteVendedor.reduce(
                          (sum, v) => sum + ingresoMensualDeCliente(v),
                          0
                        );
                        const enGeneracion = clientesDeEsteVendedor.filter((v) => v.treintaEstado === "pendiente").length;
                        const cerradosCobrados = clientesDeEsteVendedor.filter((v) => v.treintaEstado === "liberada").length;
                        const perdidos = clientesDeEsteVendedor.filter((v) => v.treintaEstado === "perdida").length;
                        return (
                          <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-[11px]">
                            <div className="flex items-center justify-between">
                              <span className="font-medium uppercase tracking-wide text-muted">Desglose de vendedor</span>
                              <a
                                href={`/api/socios/${s.id}/reporte-vendedor/excel`}
                                className="rounded-pill border border-border px-2 py-0.5 font-medium text-muted"
                              >
                                Descargar Excel
                              </a>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted">
                              <span>{clientesDeEsteVendedor.length} clientes traídos</span>
                              <span>{enGeneracion} generando comisión</span>
                              <span>{cerradosCobrados} ciclo completo</span>
                              {perdidos > 0 && <span>{perdidos} perdidos</span>}
                            </div>
                            <p>
                              Ingreso mensual bruto para WCV: <span className="font-medium text-white">{fmt(ingresoMensualBruto)}</span>
                            </p>
                          </div>
                        );
                      })()}

                      {pendiente.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                          {pendiente.map((c) => (
                            <div key={c.id} className="flex items-center justify-between text-[12px]">
                              <span className="text-muted">
                                {fmtFecha(c.createdAt)} · plan {c.plan}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{fmt(c.comisionCentavos)}</span>
                                <button
                                  onClick={() => marcarPagada(c.id)}
                                  disabled={cargando === c.id}
                                  className="rounded-pill border border-teal px-2 py-0.5 text-[11px] font-medium text-teal"
                                >
                                  {cargando === c.id ? "..." : "Marcar pagado"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {suspendidos.length > 0 && (
            <p className="text-[11px] text-muted">{suspendidos.length} suspendido(s)/rechazado(s), no se muestran aquí.</p>
          )}
        </div>
      )}
    </div>
  );
}
