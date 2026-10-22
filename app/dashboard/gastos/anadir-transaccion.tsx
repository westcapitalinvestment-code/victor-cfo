"use client";

import { useState } from "react";
import TransaccionForm, { type CategoriaOpcion, type CuentaManualOpcion } from "./transaccion-form";

// Botón "+ Añadir" de Transacciones: abre el formulario para registrar a mano
// efectivo, propinas o cualquier movimiento que no pasó por un banco.
export default function AnadirTransaccion({
  hoy,
  cuentas,
  categorias,
  abrirComo,
}: {
  hoy: string;
  cuentas: CuentaManualOpcion[];
  categorias: CategoriaOpcion[];
  // ?anadir=ingreso|gasto en la URL: abre el formulario directo.
  abrirComo?: "gasto" | "ingreso";
}) {
  const [abierto, setAbierto] = useState(!!abrirComo);
  const [aviso, setAviso] = useState(false);

  return (
    <div>
      {!abierto && (
        <button
          type="button"
          className="vc-btn-primary !w-auto px-4 !py-1.5 !text-xs"
          onClick={() => {
            setAviso(false);
            setAbierto(true);
          }}
        >
          + Añadir
        </button>
      )}
      {aviso && !abierto && <p className="mt-1 text-[11px] text-grn">Listo, añadida.</p>}
      {abierto && (
        <div className="fixed inset-x-0 top-0 z-40 max-h-screen overflow-y-auto bg-bg/95 p-3 backdrop-blur-sm sm:static sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <TransaccionForm
            hoy={hoy}
            tipoInicial={abrirComo}
            cuentas={cuentas}
            categorias={categorias}
            onListo={() => {
              setAbierto(false);
              setAviso(true);
            }}
            onCancelar={() => setAbierto(false)}
          />
        </div>
      )}
    </div>
  );
}
