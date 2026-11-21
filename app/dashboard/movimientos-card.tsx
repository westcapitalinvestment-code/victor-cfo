"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { Sensitive } from "@/lib/privacy";
import CategoriaComboBox from "./categoria-combobox";

// "Últimos movimientos" del Inicio con selector de cuenta (20 nov 2026,
// pedido de una clienta en una demo: con varias tarjetas, entre ellas la de
// su hija, quería ver y categorizar solo los de una tarjeta, sin salir del
// Inicio). La cuenta viaja en ?cuenta=plaid:<id>|manual:<id>, igual que el
// filtro de la tarjeta de pendientes; el desglose del balance usa el mismo.
type Categoria = { id: number; nombre: string };
export type Movimiento = {
  id: string;
  description_raw: string;
  amount: number;
  fecha: string;
  tipo_flujo: string | null;
  pending: boolean;
  hacienda_category_id: number | null;
  cuentaLabel: string | null;
};
type Opcion = { clave: string; nombre: string; href: string; activo: boolean };

export default function MovimientosCard({
  movimientosIniciales,
  categorias,
  opciones,
  hrefVerTodos,
}: {
  movimientosIniciales: Movimiento[];
  categorias: Categoria[];
  opciones: Opcion[];
  hrefVerTodos: string;
}) {
  const router = useRouter();
  const [movs, setMovs] = useState(movimientosIniciales);
  const [cats, setCats] = useState(categorias);
  useEffect(() => setCats(categorias), [categorias]);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => setMovs(movimientosIniciales), [movimientosIniciales]);

  const nombreCategoria = (id: number | null) => cats.find((c) => c.id === id)?.nombre ?? null;

  async function categorizar(id: string, catId: number) {
    setGuardando(id);
    setError("");
    const res = await fetch("/api/transacciones/categorizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: id, haciendaCategoryId: catId }),
    });
    setGuardando(null);
    setEditando(null);
    if (res.ok) {
      setMovs((prev) => prev.map((m) => (m.id === id ? { ...m, hacienda_category_id: catId } : m)));
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "No se pudo categorizar.");
    }
  }

  return (
    <div id="movimientos" className="vc-card mb-3 !p-0">
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="text-sm font-medium text-text">Últimos movimientos</p>
        <Link href={hrefVerTodos} className="text-xs font-medium text-teal">
          Ver todos →
        </Link>
      </div>
      {opciones.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2">
          {opciones.map((o) => (
            <Link
              key={o.clave}
              href={o.href}
              scroll={false}
              className={`flex-shrink-0 rounded-pill border px-2.5 py-1 text-[11px] font-medium ${
                o.activo ? "border-teal bg-teal text-white" : "border-border text-muted"
              }`}
            >
              {o.nombre}
            </Link>
          ))}
        </div>
      )}
      {error && <p className="px-4 pb-2 text-xs text-red">{error}</p>}
      {movs.length === 0 ? (
        <p className="border-t border-border px-4 py-3 text-sm text-muted">Esta cuenta no tiene movimientos todavía.</p>
      ) : (
        <div className="border-t border-border">
          {movs.map((m) => {
            const sale = m.tipo_flujo === "gasto" || (m.tipo_flujo !== "ingreso" && m.tipo_flujo !== "transferencia" && m.amount > 0);
            const cat = nombreCategoria(m.hacienda_category_id);
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{m.description_raw}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {m.fecha}
                    {m.cuentaLabel ? ` · ${m.cuentaLabel}` : ""}
                    {m.pending ? " · ⏳ pendiente" : ""}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span className={`text-sm font-medium ${m.tipo_flujo === "transferencia" ? "text-muted" : sale ? "text-red" : "text-grn"}`}>
                    <Sensitive>{`${sale ? "-" : "+"}${formatMoney(Math.abs(m.amount))}`}</Sensitive>
                  </span>
                  {editando === m.id ? (
                    <CategoriaComboBox
                      categorias={cats}
                      onCreada={(c) => setCats((prev) => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
                      disabled={guardando === m.id}
                      onSeleccionar={(id) => categorizar(m.id, id)}
                      onCerrar={() => setEditando(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={m.pending}
                      onClick={() => setEditando(m.id)}
                      title={m.pending ? "Espera a que el banco la confirme para categorizarla" : "Cambiar categoría"}
                      className={`rounded-pill px-2 py-0.5 text-[11px] ${cat ? "bg-bg text-muted" : "bg-amb/15 text-amb"} disabled:opacity-60`}
                    >
                      {cat ?? "Sin categoría"} ✎
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
