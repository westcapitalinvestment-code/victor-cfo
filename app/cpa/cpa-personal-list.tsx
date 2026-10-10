"use client";

import { useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";

// Lista "Personal" del Portal CPA — mismo formato que CpaClientList
// (buscador + Todos / Mis clientes / Con alertas), pero por dueño y no por
// entidad (10 oct 2026, pedido de Joel). Favoritos por contable: 0147.
export type ClientePersonal = {
  id: string; // owner_id
  nombre: string;
  email: string | null;
  alertas: string[]; // textos de alerta (vacío = sin alertas)
  esFavorito: boolean;
};

export default function CpaPersonalList({ clientes }: { clientes: ClientePersonal[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [tab, setTab] = useState<"todos" | "mios" | "alertas">("todos");
  const [favoritos, setFavoritos] = useState<Set<string>>(
    () => new Set(clientes.filter((c) => c.esFavorito).map((c) => c.id)),
  );
  const [guardando, setGuardando] = useState<string | null>(null);
  const [errorFav, setErrorFav] = useState<string | null>(null);

  async function toggleFavorito(e: MouseEvent, ownerId: string) {
    e.preventDefault();
    e.stopPropagation();
    const ya = favoritos.has(ownerId);
    setFavoritos((prev) => {
      const next = new Set(prev);
      if (ya) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });
    setGuardando(ownerId);
    setErrorFav(null);
    try {
      const res = await fetch("/api/cpa/favoritos-personal", {
        method: ya ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `No se pudo guardar (status ${res.status}).`);
      }
    } catch (err) {
      // Se revierte para no mostrar una estrella que no quedó guardada.
      setFavoritos((prev) => {
        const next = new Set(prev);
        if (ya) next.add(ownerId);
        else next.delete(ownerId);
        return next;
      });
      setErrorFav(err instanceof Error ? err.message : "No se pudo guardar el favorito.");
    } finally {
      setGuardando(null);
    }
  }

  const conAlertas = clientes.filter((c) => c.alertas.length > 0);
  const misClientes = clientes.filter((c) => favoritos.has(c.id));

  const filtrados = useMemo(() => {
    const base = tab === "alertas" ? conAlertas : tab === "mios" ? misClientes : clientes;
    const q = busqueda.trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) => c.nombre.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q));
  }, [clientes, conAlertas, misClientes, tab, busqueda]);

  const tabCls = (t: string) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === t ? "bg-teal text-white" : "text-muted hover:text-text"}`;

  return (
    <div className="vc-card mb-4">
      <p className="mb-1 text-xs uppercase tracking-wide text-muted">Personal ({clientes.length})</p>
      <p className="mb-3 text-xs text-muted">
        Finanzas personales de clientes que decidieron compartirlas contigo (planilla personal, estimadas, documentos).
      </p>

      {errorFav && (
        <p className="mb-2 rounded-lg bg-red/10 px-2.5 py-1.5 text-xs text-red">
          No se pudo guardar la estrella: {errorFav}
        </p>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o correo..."
            className="w-full rounded-lg border border-border bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-teal"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <button onClick={() => setTab("todos")} className={tabCls("todos")}>
            Todos ({clientes.length})
          </button>
          <button onClick={() => setTab("mios")} className={tabCls("mios")}>
            <i className="ti ti-star mr-1" style={{ fontSize: 11 }} />
            Mis clientes ({misClientes.length})
          </button>
          <button onClick={() => setTab("alertas")} className={tabCls("alertas")}>
            Con alertas ({conAlertas.length})
          </button>
        </div>
      </div>

      {clientes.length === 0 ? (
        <p className="text-xs text-muted">
          Ningún cliente ha compartido sus finanzas personales todavía. Cada cliente lo activa desde “Invita a tu
          contable”.
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
            <Link key={c.id} href={`/cpa/personal/${c.id}`} className="flex items-center justify-between py-3 hover:opacity-80">
              <div className="flex items-start gap-2">
                <button
                  onClick={(e) => toggleFavorito(e, c.id)}
                  disabled={guardando === c.id}
                  title={favoritos.has(c.id) ? "Quitar de Mis clientes" : "Marcar como Mis clientes"}
                  className="mt-0.5 flex-shrink-0"
                >
                  <i
                    className={favoritos.has(c.id) ? "ti ti-star-filled text-amb" : "ti ti-star text-muted"}
                    style={{ fontSize: 16 }}
                  />
                </button>
                <div>
                  <p className="text-sm font-medium">{c.nombre}</p>
                  <p className="text-xs text-muted">
                    Personal{c.email && c.email !== c.nombre ? ` · ${c.email}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {c.alertas.length > 0 && (
                  <span title={c.alertas.join("\n")} className="rounded-full bg-red/10 px-2 py-1 text-[10px] font-medium text-red">
                    {c.alertas.length} alerta{c.alertas.length === 1 ? "" : "s"}
                  </span>
                )}
                {c.email && (
                  <button
                    type="button"
                    title={`Escribir a ${c.nombre}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.location.href = `mailto:${c.email}?subject=${encodeURIComponent(`${c.nombre} — consulta de tu contable`)}`;
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
    </div>
  );
}
