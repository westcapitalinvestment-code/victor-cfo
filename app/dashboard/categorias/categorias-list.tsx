"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CategoriaFila = {
  id: number;
  nombre: string;
  esPropia: boolean;
  lineaScheduleC: string | null;
  conteo: number;
};

// Lista de categorías con fusionar/renombrar/eliminar (10 sept 2026, pedido
// de Joel: "hay una que dice Telefonica y otra Telefonia y ambas tienen
// gastos y debe ser la misma"). Ver /api/categorias/fusionar/route.ts para
// el porqué de cada guardarraíl (por qué global nunca se borra, por qué
// también se tocan los merchant_patterns, etc.) — aquí solo vive la UI.
export default function CategoriasList({ categorias }: { categorias: CategoriaFila[] }) {
  const router = useRouter();
  const [fusionando, setFusionando] = useState<number | null>(null);
  const [destinoElegido, setDestinoElegido] = useState<Record<number, string>>({});
  const [renombrando, setRenombrando] = useState<number | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [cargando, setCargando] = useState<number | null>(null);
  const [errorPorFila, setErrorPorFila] = useState<Record<number, string>>({});
  const [avisoPorFila, setAvisoPorFila] = useState<Record<number, string>>({});

  const porNombre = [...categorias].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  function limpiarMensajes(id: number) {
    setErrorPorFila((prev) => ({ ...prev, [id]: "" }));
    setAvisoPorFila((prev) => ({ ...prev, [id]: "" }));
  }

  async function confirmarFusion(origenId: number) {
    const destinoId = destinoElegido[origenId];
    if (!destinoId) return;
    const origen = categorias.find((c) => c.id === origenId);
    const destino = categorias.find((c) => c.id === Number(destinoId));
    if (!origen || !destino) return;

    const confirmado = window.confirm(
      `Esto va a mover ${origen.conteo} transacción(es) de "${origen.nombre}" a "${destino.nombre}"` +
        (origen.esPropia ? `, y borrar "${origen.nombre}".` : ` (es una categoría global, no se borra).`) +
        ` ¿Seguro?`
    );
    if (!confirmado) return;

    setCargando(origenId);
    limpiarMensajes(origenId);
    const res = await fetch("/api/categorias/fusionar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origenId, destinoId: Number(destinoId) }),
    });
    const data = await res.json().catch(() => null);
    setCargando(null);
    if (!res.ok) {
      setErrorPorFila((prev) => ({ ...prev, [origenId]: data?.error ?? "No se pudo fusionar." }));
      return;
    }
    setFusionando(null);
    if (data.aviso) setAvisoPorFila((prev) => ({ ...prev, [origenId]: data.aviso }));
    router.refresh();
  }

  async function confirmarRenombrar(id: number) {
    const nombre = nombreNuevo.trim();
    if (!nombre) return;
    setCargando(id);
    limpiarMensajes(id);
    const res = await fetch(`/api/categorias/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    const data = await res.json().catch(() => null);
    setCargando(null);
    if (!res.ok) {
      setErrorPorFila((prev) => ({ ...prev, [id]: data?.error ?? "No se pudo renombrar." }));
      return;
    }
    setRenombrando(null);
    setNombreNuevo("");
    router.refresh();
  }

  async function eliminar(id: number, nombre: string) {
    if (!window.confirm(`¿Eliminar "${nombre}"? Solo funciona si no tiene transacciones.`)) return;
    setCargando(id);
    limpiarMensajes(id);
    const res = await fetch(`/api/categorias/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    setCargando(null);
    if (!res.ok) {
      setErrorPorFila((prev) => ({ ...prev, [id]: data?.error ?? "No se pudo eliminar." }));
      return;
    }
    router.refresh();
  }

  return (
    <div className="vc-card !p-0">
      <ul className="flex flex-col">
        {porNombre.map((c) => (
          <li key={c.id} className="border-b border-border px-4 py-3 last:border-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{c.nombre}</span>
                  <span
                    className={`rounded-pill px-2 py-0.5 text-[10px] font-medium ${
                      c.esPropia ? "bg-teal/[.12] text-teal" : "bg-border text-muted"
                    }`}
                  >
                    {c.esPropia ? "Personal" : "Global"}
                  </span>
                  <span className="text-xs text-muted">
                    {c.conteo} transacción{c.conteo === 1 ? "" : "es"}
                  </span>
                </div>
                {c.lineaScheduleC && <p className="mt-0.5 text-[11px] text-muted">{c.lineaScheduleC}</p>}
              </div>
              <div className="flex flex-shrink-0 gap-3 text-xs">
                {c.esPropia && (
                  <button
                    type="button"
                    className="font-medium text-muted hover:text-teal"
                    onClick={() => {
                      setRenombrando(renombrando === c.id ? null : c.id);
                      setFusionando(null);
                      setNombreNuevo(c.nombre);
                      limpiarMensajes(c.id);
                    }}
                  >
                    Renombrar
                  </button>
                )}
                <button
                  type="button"
                  className="font-medium text-muted hover:text-teal"
                  onClick={() => {
                    setFusionando(fusionando === c.id ? null : c.id);
                    setRenombrando(null);
                    limpiarMensajes(c.id);
                  }}
                >
                  Fusionar
                </button>
                {c.esPropia && (
                  <button
                    type="button"
                    className="font-medium text-muted hover:text-red disabled:opacity-40"
                    disabled={cargando === c.id}
                    onClick={() => eliminar(c.id, c.nombre)}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>

            {renombrando === c.id && (
              <div className="mt-2 flex gap-2">
                <input
                  autoFocus
                  className="vc-input !py-1 !text-xs"
                  value={nombreNuevo}
                  onChange={(e) => setNombreNuevo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmarRenombrar(c.id)}
                  disabled={cargando === c.id}
                />
                <button
                  type="button"
                  className="vc-btn-primary flex-shrink-0 !py-1 !text-xs"
                  onClick={() => confirmarRenombrar(c.id)}
                  disabled={cargando === c.id || !nombreNuevo.trim()}
                >
                  {cargando === c.id ? "Guardando..." : "Guardar"}
                </button>
              </div>
            )}

            {fusionando === c.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Mover todo a:</span>
                <select
                  className="vc-input !w-auto !py-1 !text-xs"
                  value={destinoElegido[c.id] ?? ""}
                  onChange={(e) => setDestinoElegido((prev) => ({ ...prev, [c.id]: e.target.value }))}
                >
                  <option value="">Elige la categoría destino...</option>
                  {porNombre
                    .filter((otra) => otra.id !== c.id)
                    .map((otra) => (
                      <option key={otra.id} value={otra.id}>
                        {otra.nombre} {otra.esPropia ? "" : "(global)"}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className="vc-btn-primary flex-shrink-0 !py-1 !text-xs"
                  disabled={cargando === c.id || !destinoElegido[c.id]}
                  onClick={() => confirmarFusion(c.id)}
                >
                  {cargando === c.id ? "Fusionando..." : "Fusionar"}
                </button>
              </div>
            )}

            {errorPorFila[c.id] && <p className="mt-1.5 text-xs text-amb">⚠ {errorPorFila[c.id]}</p>}
            {avisoPorFila[c.id] && <p className="mt-1.5 text-xs text-muted">ℹ {avisoPorFila[c.id]}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
