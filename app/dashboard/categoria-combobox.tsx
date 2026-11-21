"use client";

import { useEffect, useRef, useState } from "react";

// Combobox de categoría con búsqueda Y "Crear categoría" (20 nov 2026,
// pedido de Joel: si la categoría no existe, había que salir a
// Transacciones a crearla y volver). Si lo escrito no coincide exacto con
// ninguna, sale "+ Crear «…»": la crea (/api/categorias/crear) y la usa de
// una vez en esa transacción. Lo usan el Inicio (pendientes y últimos
// movimientos) y la lista de Transacciones.
export type Categoria = { id: number; nombre: string };

export default function CategoriaComboBox({
  categorias,
  disabled,
  onSeleccionar,
  onCerrar,
  onCreada,
  wrapperClassName = "relative",
  inputClassName = "vc-input !w-36 !py-1.5 !text-xs",
  menuClassName = "absolute right-0 z-20 mt-1 max-h-48 w-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg",
}: {
  categorias: Categoria[];
  disabled?: boolean;
  onSeleccionar: (id: number) => void;
  onCerrar: () => void;
  onCreada?: (c: Categoria) => void;
  wrapperClassName?: string;
  inputClassName?: string;
  menuClassName?: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onCerrar();
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const texto = busqueda.trim();
  const filtradas = texto ? categorias.filter((c) => c.nombre.toLowerCase().includes(texto.toLowerCase())) : categorias;
  const existeExacta = categorias.some((c) => c.nombre.trim().toLowerCase() === texto.toLowerCase());

  async function crear() {
    if (!texto || creando) return;
    setCreando(true);
    setError("");
    const res = await fetch("/api/categorias/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: texto.slice(0, 60) }),
    });
    const j = await res.json().catch(() => ({}));
    setCreando(false);
    if (!res.ok || !j.categoria) {
      setError(j.error ?? "No se pudo crear la categoría.");
      return;
    }
    onCreada?.(j.categoria as Categoria);
    onSeleccionar((j.categoria as Categoria).id);
  }

  return (
    <div className={wrapperClassName} ref={ref}>
      <input
        autoFocus
        className={inputClassName}
        placeholder="Buscar o crear categoría..."
        disabled={disabled || creando}
        value={busqueda}
        onChange={(e) => {
          setBusqueda(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCerrar();
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtradas.length === 1) onSeleccionar(filtradas[0].id);
            else if (texto && !existeExacta && filtradas.length === 0) crear();
          }
        }}
      />
      <div className={menuClassName}>
        {texto && !existeExacta && (
          <button
            type="button"
            disabled={creando}
            className="block w-full border-b border-border px-2.5 py-1.5 text-left text-xs font-medium text-[#1d6fe0] hover:bg-bg disabled:opacity-60"
            onClick={crear}
          >
            {creando ? "Creando..." : `+ Crear «${texto.slice(0, 60)}»`}
          </button>
        )}
        {error && <p className="px-2.5 py-1.5 text-xs text-red">{error}</p>}
        {filtradas.length === 0 && !texto && <p className="p-2 text-xs text-muted">Sin resultados.</p>}
        {filtradas.map((c) => (
          <button
            key={c.id}
            type="button"
            className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-bg"
            onClick={() => onSeleccionar(c.id)}
          >
            {c.nombre}
          </button>
        ))}
      </div>
    </div>
  );
}
