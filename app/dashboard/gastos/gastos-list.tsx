"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";

type Transaccion = {
  id: string;
  description_raw: string;
  amount: number;
  fecha: string;
  hacienda_category_id: number | null;
  plaid_account_id: string | null;
  manual_account_id: string | null;
  tipo_flujo?: "gasto" | "ingreso" | "transferencia";
};

type Categoria = { id: number; nombre: string };

export default function GastosList({
  transaccionesIniciales,
  categorias,
  nombrePorCuenta,
}: {
  transaccionesIniciales: Transaccion[];
  categorias: Categoria[];
  // Mapa "plaid:<id>" | "manual:<id>" → "BPPR Visa ···4821", para
  // identificar de qué banco/tarjeta vino cada transacción cuando el
  // usuario tiene más de una cuenta conectada (Plaid o manual). Vacío/
  // ausente = no mostrar nada.
  nombrePorCuenta?: Record<string, string>;
}) {
  const router = useRouter();
  const [transacciones, setTransacciones] = useState(transaccionesIniciales);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  // Antes, si /api/transacciones/categorizar fallaba (ej. el guardarraíl de
  // dirección rechazando una categoría que no cuadra con tipo_flujo), esto
  // no hacía NADA visible — el dropdown simplemente "no pegaba" y el
  // usuario no tenía forma de saber por qué, solo que "cambio la
  // categoría y no se guarda". Ahora se guarda el mensaje de error por
  // fila y se muestra debajo del selector hasta el próximo intento.
  const [errorPorFila, setErrorPorFila] = useState<Record<string, string>>({});

  const nombreCategoria = (id: number | null) =>
    categorias.find((c) => c.id === id)?.nombre ?? "Sin categorizar";

  async function guardarCategoria(transactionId: string, haciendaCategoryId: number) {
    setGuardando(transactionId);
    setErrorPorFila((prev) => ({ ...prev, [transactionId]: "" }));
    const res = await fetch("/api/transacciones/categorizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, haciendaCategoryId }),
    });
    setGuardando(null);
    if (res.ok) {
      setEditando(null);
      setTransacciones((prev) =>
        prev.map((t) => (t.id === transactionId ? { ...t, hacienda_category_id: haciendaCategoryId } : t))
      );
      router.refresh();
    } else {
      const body = await res.json().catch(() => null);
      setErrorPorFila((prev) => ({ ...prev, [transactionId]: body?.error ?? "No se pudo guardar la categoría." }));
      // Se queda en modo edición (no se llama setEditando(null)) para que
      // el usuario vea el error justo debajo del selector y pueda elegir
      // otra categoría sin tener que volver a tocar la fila.
    }
  }

  return (
    <ul className="flex flex-col gap-1">
      {transacciones.map((t) => (
        <li key={t.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
          <div className="min-w-0 flex-1">
            <p className="truncate">{t.description_raw}</p>
            {editando === t.id ? (
              <>
                <select
                  autoFocus
                  className="vc-input mt-1 !py-1 !text-xs"
                  defaultValue={t.hacienda_category_id ?? ""}
                  disabled={guardando === t.id}
                  onChange={(e) => guardarCategoria(t.id, Number(e.target.value))}
                  onBlur={() => setEditando(null)}
                >
                  <option value="" disabled>
                    Elige categoría...
                  </option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                {errorPorFila[t.id] && <p className="mt-1 text-xs text-amb">⚠ {errorPorFila[t.id]}</p>}
              </>
            ) : errorPorFila[t.id] ? (
              // Fuera de modo edición pero con un error pendiente (ej. el
              // onBlur del selector cerró la edición antes de que llegara
              // la respuesta del servidor) — se sigue mostrando el aviso y
              // se deja reintentar con un toque, en vez de perder el error.
              <button
                className="mt-0.5 text-left text-xs text-amb underline decoration-dotted"
                onClick={() => setEditando(t.id)}
              >
                {t.fecha} · {nombreCategoria(t.hacienda_category_id)} · ⚠ {errorPorFila[t.id]}
              </button>
            ) : (
              <button
                className="mt-0.5 text-xs text-muted underline decoration-dotted hover:text-teal"
                onClick={() => setEditando(t.id)}
              >
                {t.fecha} · {nombreCategoria(t.hacienda_category_id)}
                {t.tipo_flujo === "transferencia" ? " · Transferencia (no cuenta como gasto)" : ""}
                {(() => {
                  const clave = t.manual_account_id
                    ? `manual:${t.manual_account_id}`
                    : t.plaid_account_id
                      ? `plaid:${t.plaid_account_id}`
                      : null;
                  const nombreCuenta = clave ? nombrePorCuenta?.[clave] : null;
                  return nombreCuenta ? ` · ${nombreCuenta}` : "";
                })()}
              </button>
            )}
          </div>
          <span
            className={`ml-3 flex-shrink-0 ${
              t.tipo_flujo === "transferencia"
                ? "text-muted"
                : t.tipo_flujo === "ingreso"
                  ? "text-grn"
                  : t.tipo_flujo === "gasto"
                    ? "text-red"
                    : Number(t.amount) > 0
                      ? "text-red"
                      : "text-grn"
            }`}
          >
            <Sensitive>{formatMoney(Math.abs(Number(t.amount)))}</Sensitive>
          </span>
        </li>
      ))}
    </ul>
  );
}
