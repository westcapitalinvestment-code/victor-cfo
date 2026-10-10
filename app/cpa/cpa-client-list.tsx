"use client";

import { useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";

// Lista de clientes del Portal CPA, como componente aparte (2 oct 2026,
// pedido de Joel: "un contable con 45 clientes ve un número ahí de
// $258,352.72 y eso crea un chaos emocional" — la página /cpa dejó de
// mostrar $ sumados de todo el portafolio; ahora es buscador + tabs +
// lista, con el detalle de cada cliente a un click, igual que haría
// cualquier portal de verdad con muchos clientes).
export type ClienteCpa = {
  id: string;
  name: string;
  entityType: string | null;
  ein: string | null;
  ownerName: string | null;
  // Correo del dueño, para el botón "Escribir" (abre el correo del contable).
  ownerEmail: string | null;
  // "firma" = cliente invitado bajo el plan de la firma (el contador lo paga);
  // "propio" = cliente que ya tenía VICTOR y te dio acceso.
  origen: "firma" | "propio";
  alertCount: number;
  // Favoritos por contable (migración 0140, 4 oct 2026, pedido de Joel a
  // nombre de su esposa) — true si EL CONTABLE LOGUEADO marcó este cliente
  // como suyo, no es compartido con el resto del equipo.
  esFavorito: boolean;
  ivu: { status: "depositado" | "overdue" | "pendiente"; monto: number } | null;
};

export default function CpaClientList({ clientes }: { clientes: ClienteCpa[] }) {
  const [abierto, setAbierto] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState<"todos" | "mios" | "alertas">("todos");
  // Estado optimista de favoritos — arranca del valor que trajo el server
  // (esFavorito) y se actualiza al instante al hacer click en la
  // estrellita, sin esperar la respuesta ni recargar la página.
  const [favoritos, setFavoritos] = useState<Set<string>>(
    () => new Set(clientes.filter((c) => c.esFavorito).map((c) => c.id)),
  );
  const [guardandoFavorito, setGuardandoFavorito] = useState<string | null>(null);
  const [errorFavorito, setErrorFavorito] = useState<string | null>(null);

  async function toggleFavorito(e: MouseEvent, entityId: string) {
    e.preventDefault();
    e.stopPropagation();
    const yaEsFavorito = favoritos.has(entityId);
    // Optimista: cambia la estrellita de una vez, antes de que responda el
    // servidor — es solo organización visual de un contable, no hace falta
    // esperar.
    setFavoritos((prev) => {
      const next = new Set(prev);
      if (yaEsFavorito) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
    setGuardandoFavorito(entityId);
    setErrorFavorito(null);
    try {
      const res = await fetch("/api/cpa/favoritos", {
        method: yaEsFavorito ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId }),
      });
      // Bug (4 oct 2026, reportado por Joel: "una vez los selecciono y
      // entro a una entidad se deseleccionan y vuelve a 0") — fetch() NO
      // lanza excepción con un status 4xx/5xx, solo si falla la red. Antes
      // este bloque solo revertía en el catch, así que un error real del
      // servidor (ej. la migración 0140 todavía no corrida en Supabase, o
      // la tabla cpa_client_favoritos sin crear) quedaba invisible: la
      // estrellita se veía marcada en pantalla pero NUNCA se guardó en la
      // base — al navegar a /cpa/[entityId] y volver, el server vuelve a
      // consultar la tabla, no encuentra nada, y todo se ve en 0 de nuevo.
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `No se pudo guardar (status ${res.status}).`);
      }
    } catch (err) {
      // Se revierte — mejor eso que dejar una estrellita mintiendo sobre lo
      // que de verdad quedó guardado.
      setFavoritos((prev) => {
        const next = new Set(prev);
        if (yaEsFavorito) next.add(entityId);
        else next.delete(entityId);
        return next;
      });
      setErrorFavorito(err instanceof Error ? err.message : "No se pudo guardar el favorito.");
    } finally {
      setGuardandoFavorito(null);
    }
  }

  const conAlertas = clientes.filter((c) => c.alertCount > 0);
  const misClientes = clientes.filter((c) => favoritos.has(c.id));

  const filtrados = useMemo(() => {
    const base = tab === "alertas" ? conAlertas : tab === "mios" ? misClientes : clientes;
    const q = busqueda.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.ein ?? "").toLowerCase().includes(q) ||
        (c.ownerName ?? "").toLowerCase().includes(q),
    );
  }, [clientes, conAlertas, misClientes, tab, busqueda]);

  return (
    <div className="vc-card">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="mb-3 flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-xs uppercase tracking-wide text-muted">
          Entidades ({clientes.length})
          {!abierto && conAlertas.length > 0 && (
            <span className="ml-2 rounded-full bg-red/10 px-2 py-0.5 text-[10px] font-medium normal-case text-red">
              {conAlertas.length} con alertas
            </span>
          )}
        </span>
        <i className={`ti ${abierto ? "ti-chevron-up" : "ti-chevron-down"} text-muted`} />
      </button>
      {abierto && (<>

      {errorFavorito && (
        <p className="mb-2 rounded-lg bg-red/10 px-2.5 py-1.5 text-xs text-red">
          No se pudo guardar la estrella: {errorFavorito}
        </p>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por entidad, dueño o EIN..."
            className="w-full rounded-lg border border-border bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-teal"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <button
            onClick={() => setTab("todos")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "todos" ? "bg-teal text-white" : "text-muted hover:text-text"
            }`}
          >
            Todos ({clientes.length})
          </button>
          <button
            onClick={() => setTab("mios")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "mios" ? "bg-teal text-white" : "text-muted hover:text-text"
            }`}
          >
            <i className="ti ti-star mr-1" style={{ fontSize: 11 }} />
            Mis clientes ({misClientes.length})
          </button>
          <button
            onClick={() => setTab("alertas")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "alertas" ? "bg-teal text-white" : "text-muted hover:text-text"
            }`}
          >
            Con alertas ({conAlertas.length})
          </button>
        </div>
      </div>

      {clientes.length === 0 ? (
        <p className="text-xs text-muted">
          Todavía no tienes clientes conectados. En cuanto un dueño te invite y aceptes, aparecerán aquí.
        </p>
      ) : filtrados.length === 0 ? (
        <p className="text-xs text-muted">
          {tab === "alertas"
            ? "Ningún cliente tiene alertas pendientes ahora mismo."
            : tab === "mios"
              ? "Todavía no has marcado ningún cliente con la estrella — búscalo en \"Todos\" y márcalo para que aparezca aquí."
              : "No hay clientes que coincidan con esa búsqueda."}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {filtrados.map((c) => (
            <Link key={c.id} href={`/cpa/${c.id}`} className="flex items-center justify-between py-3 hover:opacity-80">
              <div className="flex items-start gap-2">
                <button
                  onClick={(e) => toggleFavorito(e, c.id)}
                  disabled={guardandoFavorito === c.id}
                  title={favoritos.has(c.id) ? "Quitar de Mis clientes" : "Marcar como Mis clientes"}
                  className="mt-0.5 flex-shrink-0"
                >
                  <i
                    className={favoritos.has(c.id) ? "ti ti-star-filled text-amb" : "ti ti-star text-muted"}
                    style={{ fontSize: 16 }}
                  />
                </button>
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted">
                    {c.entityType} {c.ein ? `· EIN ${c.ein}` : ""}
                    {c.ownerName ? ` · de ${c.ownerName}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.origen === "firma" && (
                  <span className="rounded-full bg-teal/10 px-2 py-1 text-[10px] font-medium text-teal">
                    Incluido por tu firma
                  </span>
                )}
                {c.alertCount > 0 && (
                  <span className="rounded-full bg-red/10 px-2 py-1 text-[10px] font-medium text-red">
                    {c.alertCount} alerta{c.alertCount === 1 ? "" : "s"}
                  </span>
                )}
                {c.ivu ? (
                  <span
                    className={
                      "rounded-full px-2 py-1 text-[10px] font-medium " +
                      (c.ivu.status === "depositado"
                        ? "bg-grn/10 text-grn"
                        : c.ivu.status === "overdue"
                          ? "bg-red/10 text-red"
                          : "bg-amb/10 text-amb")
                    }
                  >
                    IVU {formatMoney(c.ivu.monto)}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted/10 px-2 py-1 text-[10px] text-muted">Sin datos IVU</span>
                )}
                {c.ownerEmail && (
                  // Botón (no <a>) porque la fila ya es un <Link>; abre el cliente de correo del contable.
                  <button
                    type="button"
                    title={`Escribir a ${c.ownerName || c.ownerEmail}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const asunto = encodeURIComponent(`${c.name} — consulta de tu contable`);
                      window.location.href = `mailto:${c.ownerEmail}?subject=${asunto}`;
                    }}
                    className="flex items-center gap-1 rounded-full border border-teal px-2 py-1 text-[10px] font-medium text-teal"
                  >
                    <i className="ti ti-mail" style={{ fontSize: 12 }} /> Escribir
                  </button>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
      </>)}
    </div>
  );
}
