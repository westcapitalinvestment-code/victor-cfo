"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Opcion = { catKey: string | null; nombre: string; href: string; activa: boolean };

// Dropdown de categoría (single-select, "Todas" por defecto) con un
// "+ Añadir categoría" al fondo — antes la ÚNICA forma de filtrar por
// categoría era tocar una barra dentro del reporte de arriba, y la ÚNICA
// forma de crear una categoría nueva era pedírselo a VICTOR por chat. Esto
// da las dos cosas directo en la pantalla, sin scroll y sin chat.
export default function CategoriaDropdown({ opciones }: { opciones: Opcion[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [nombreNueva, setNombreNueva] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAgregando(false);
        setError(null);
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  async function crearCategoria() {
    const nombre = nombreNueva.trim();
    if (!nombre) return;
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/categorias/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    const data = await res.json().catch(() => null);
    setGuardando(false);
    if (!res.ok) {
      setError(data?.error ?? "No se pudo crear la categoría.");
      return;
    }
    setNombreNueva("");
    setAgregando(false);
    setOpen(false);
    // Salta directo a ver la categoría recién creada — conserva
    // cuenta/tipo/mes actuales (useSearchParams trae todo lo que ya está
    // en la URL), solo cambia ?categoria= al id nuevo que acaba de volver.
    const params = new URLSearchParams(searchParams.toString());
    params.set("categoria", String(data.categoria.id));
    router.push(`/dashboard/gastos?${params.toString()}`);
    router.refresh();
  }

  const activa = opciones.find((o) => o.activa);
  const etiqueta = activa?.nombre ?? "Todas";
  const hayFiltro = !!activa && activa.catKey !== null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${
          hayFiltro ? "border-teal text-teal" : "text-muted"
        }`}
        style={{ borderColor: hayFiltro ? undefined : "var(--border)" }}
      >
        Categoría: {etiqueta} ▾
      </button>
      {open && (
        <div className="vc-card absolute left-0 top-9 z-10 flex max-h-80 w-64 flex-col gap-1 overflow-y-auto">
          {opciones.map((o) => (
            <Link
              key={o.catKey ?? "todas"}
              href={o.href}
              onClick={() => setOpen(false)}
              className={`rounded-lg px-2 py-1.5 text-left text-xs hover:opacity-80 ${
                o.activa ? "bg-teal/[.08] font-medium text-teal" : ""
              }`}
            >
              {o.nombre}
            </Link>
          ))}
          <div className="my-1 h-px bg-border" />
          {agregando ? (
            <div className="flex flex-col gap-2 px-1 pb-1">
              <input
                autoFocus
                className="vc-input !py-1 !text-xs"
                placeholder="Nombre de la categoría"
                value={nombreNueva}
                onChange={(e) => setNombreNueva(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && crearCategoria()}
                disabled={guardando}
              />
              {error && <p className="text-xs text-amb">⚠ {error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="vc-btn-primary flex-1 !py-1 !text-xs"
                  onClick={crearCategoria}
                  disabled={guardando || !nombreNueva.trim()}
                >
                  {guardando ? "Creando..." : "Crear"}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg border px-2 py-1 text-xs text-muted hover:opacity-80"
                  style={{ borderColor: "var(--border)" }}
                  onClick={() => {
                    setAgregando(false);
                    setError(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAgregando(true)}
              className="rounded-lg px-2 py-1.5 text-left text-xs font-medium text-teal hover:opacity-80"
            >
              + Añadir categoría
            </button>
          )}
        </div>
      )}
    </div>
  );
}
