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
export default function CuentaDropdown({ opciones, seleccionadas }: { opciones: Opcion[]; seleccionadas: string[] }) {
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

  function aplicar(nuevasClaves: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (nuevasClaves.length > 0) params.set("cuentas", nuevasClaves.join(","));
    else params.delete("cuentas");
    params.delete("categoria");
    const qs = params.toString();
    router.push(`/dashboard/gastos${qs ? `?${qs}` : ""}`);
  }

  function toggle(clave: string) {
    const nuevas = seleccionadas.includes(clave) ? seleccionadas.filter((c) => c !== clave) : [...seleccionadas, clave];
    aplicar(nuevas);
  }

  const etiqueta =
    seleccionadas.length === 0
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
          seleccionadas.length > 0 ? "border-teal text-teal" : "text-muted"
        }`}
        style={{ borderColor: seleccionadas.length > 0 ? undefined : "var(--border)" }}
      >
        Cuenta: {etiqueta} ▾
      </button>
      {open && (
        <div className="vc-card absolute left-0 top-9 z-10 flex w-64 flex-col gap-1">
          <button
            type="button"
            onClick={() => aplicar([])}
            className={`rounded-lg px-2 py-1.5 text-left text-xs hover:opacity-80 ${
              seleccionadas.length === 0 ? "bg-teal/[.08] font-medium text-teal" : ""
            }`}
          >
            Todas las cuentas
          </button>
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
