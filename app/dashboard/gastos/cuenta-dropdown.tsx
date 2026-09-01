"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Opcion = { clave: string; nombre: string };

// Dropdown de cuentas con checkboxes (multi-select) — reemplaza la fila de
// pills de cuenta que antes estaba siempre visible en pantalla, igual que
// el "Included Accounts" del reporte del BPPR. Cada click en un checkbox
// aplica de inmediato (no hace falta botón "Aplicar"): arma la URL con
// ?cuentas=plaid:id1,manual:id2 y navega, conservando tipo/mes activos
// (useSearchParams trae TODOS los params actuales, no solo cuenta) pero
// soltando la categoría — una categoría elegida en una cuenta puede no
// existir/tener sentido en otra combinación de cuentas.
//
// page.tsx pasa `seleccionadas` tal cual viene de la URL — sin filtro
// (?cuentas= ausente) los checkboxes arrancan DESMARCADOS (Joel lo pidió
// así explícitamente: por defecto no hay nada seleccionado, y desde ahí
// se puede marcar una por una, o de un tiro con "Todas las cuentas").
// "Todas las cuentas" ahora es un toggle real de seleccionar/deseleccionar
// TODO: si ya están todas marcadas, lo desmarca todo; si no, las marca
// todas — antes ese botón solo borraba el filtro (?cuentas= fuera) sin
// tocar los checkboxes, así que parecía que "no hacía nada" visualmente.
// basePath (1 sept 2026) — reusado por Gastos de negocio, que necesita
// navegar a /dashboard/negocio/gastos en vez de /dashboard/gastos. Default
// conserva el comportamiento de siempre para Personal.
export default function CuentaDropdown({
  opciones,
  seleccionadas,
  basePath = "/dashboard/gastos",
}: {
  opciones: Opcion[];
  seleccionadas: string[];
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  // Vacío = sin filtro (se quita el parámetro de la URL); cualquier otra
  // lista, incluyendo TODAS explícitamente, se guarda tal cual para que
  // los checkboxes se vean marcados al recargar — a propósito NO se
  // colapsa "todas marcadas" a "sin parámetro", porque eso es justo lo
  // que hacía que "Todas las cuentas" pareciera no seleccionar nada.
  function aplicar(nuevasClaves: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (nuevasClaves.length > 0) params.set("cuentas", nuevasClaves.join(","));
    else params.delete("cuentas");
    params.delete("categoria");
    const qs = params.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  }

  function toggle(clave: string) {
    const nuevas = seleccionadas.includes(clave) ? seleccionadas.filter((c) => c !== clave) : [...seleccionadas, clave];
    aplicar(nuevas);
  }

  const todasMarcadas = opciones.length > 0 && seleccionadas.length === opciones.length;
  // Un filtro "activo" de verdad (para resaltar el botón) es cualquier
  // selección parcial — ni vacío (todo, por defecto) ni todas marcadas
  // (todo, explícito) cambian lo que se ve en la lista de transacciones.
  const filtroActivo = seleccionadas.length > 0 && !todasMarcadas;
  const etiqueta =
    seleccionadas.length === 0
      ? "Todas las cuentas"
      : todasMarcadas
        ? "Todas las cuentas"
        : seleccionadas.length === 1
          ? (opciones.find((o) => o.clave === seleccionadas[0])?.nombre ?? "1 cuenta")
          : `${seleccionadas.length} cuentas`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${
          filtroActivo ? "border-teal text-teal" : "text-muted"
        }`}
        style={{ borderColor: filtroActivo ? undefined : "var(--border)" }}
      >
        Cuenta: {etiqueta} ▾
      </button>
      {open && (
        <div className="vc-card absolute left-0 top-9 z-10 flex w-64 flex-col gap-1">
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium hover:opacity-80 ${
              todasMarcadas ? "bg-teal/[.08] text-teal" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={todasMarcadas}
              onChange={() => aplicar(todasMarcadas ? [] : opciones.map((o) => o.clave))}
            />
            Todas las cuentas
          </label>
          <div className="my-1 h-px bg-border" />
          {opciones.map((o) => (
            <label
              key={o.clave}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:opacity-80"
            >
              <input type="checkbox" checked={seleccionadas.includes(o.clave)} onChange={() => toggle(o.clave)} />
              {o.nombre}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
