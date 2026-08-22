"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

type Categoria = { id: number; nombre: string };

type Pendiente = {
  id: string;
  description_raw: string;
  amount: number;
  fecha: string;
  sugeridaId: number | null;
  tipo_flujo?: "gasto" | "ingreso" | "transferencia";
  pending?: boolean;
};

// Tarjeta de "gastos sin categorizar" en el Inicio — calcada del mockup
// original (VICTOR — Dashboard Core.html): a medida que entran transacciones
// nuevas, el motor (trigger_auto_categorize, 0001) ya categoriza solo las
// que reconoce con alta confianza — lo que queda aquí es justo lo que el
// motor NO pudo decidir por sí mismo, así que necesita que el usuario
// confirme. Cada fila trae una categoría SUGERIDA (del mismo match_category
// que usa el motor, pero sin el filtro de confianza/confirmado) — el
// usuario solo tiene que aceptarla o cambiarla, no elegir desde cero.
export default function GastosPendientesCard({
  pendientesIniciales,
  totalPendientes,
  categorias,
}: {
  pendientesIniciales: Pendiente[];
  totalPendientes: number;
  categorias: Categoria[];
}) {
  const router = useRouter();
  const [pendientes, setPendientes] = useState(pendientesIniciales);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(true);

  const nombreCategoria = (id: number | null) => categorias.find((c) => c.id === id)?.nombre ?? null;

  async function categorizar(transactionId: string, haciendaCategoryId: number) {
    setGuardando(transactionId);
    const res = await fetch("/api/transacciones/categorizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, haciendaCategoryId }),
    });
    setGuardando(null);
    if (res.ok) {
      setPendientes((prev) => prev.filter((p) => p.id !== transactionId));
      // Invalida la caché de navegación de Next.js para esta ruta — sin
      // esto, si el usuario navega a otra pestaña y vuelve a Inicio poco
      // después, Next a veces reusa la versión ya cargada en el navegador
      // (de antes de categorizar) en vez de pedir los datos frescos, y el
      // gasto que ya se categorizó parece "reaparecer" como pendiente.
      router.refresh();
    }
  }

  if (pendientes.length === 0) return null;

  const restantes = totalPendientes - pendientesIniciales.length;

  return (
    <div className="vc-card mb-3 !p-0 border-amb">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🏷️</span>
          <div>
            <p className="text-sm font-medium text-text">
              {pendientes.length} gasto{pendientes.length > 1 ? "s" : ""} sin categorizar
            </p>
            <p className="text-[11px] text-muted">Toca cada uno para categorizarlo o acepta la sugerencia</p>
          </div>
        </div>
        <span className="text-xs text-muted">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto && (
        <div className="border-t border-border">
          {pendientes.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">{p.description_raw}</p>
                {p.pending && (
                  <p className="mt-0.5 text-[11px] text-amb">
                    ⏳ Pendiente — el banco todavía puede corregir el monto o el nombre
                  </p>
                )}
                <p className="mt-0.5 text-[11px] text-muted">
                  {p.fecha} ·{" "}
                  <span
                    className={
                      p.tipo_flujo === "transferencia"
                        ? "text-muted"
                        : p.tipo_flujo === "ingreso"
                          ? "text-grn"
                          : p.tipo_flujo === "gasto"
                            ? "text-red"
                            : p.amount > 0
                              ? "text-red"
                              : "text-grn"
                    }
                  >
                    {formatMoney(Math.abs(Number(p.amount)))}
                  </span>
                </p>
              </div>
              <select
                className="vc-input !w-auto !py-1.5 !text-xs"
                defaultValue={p.sugeridaId ?? ""}
                disabled={guardando === p.id}
                onChange={(e) => categorizar(p.id, Number(e.target.value))}
              >
                <option value="" disabled>
                  {p.sugeridaId ? `¿${nombreCategoria(p.sugeridaId)}?` : "Categoría..."}
                </option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {/* Antes esto mandaba a /dashboard/gastos sin filtro — el usuario
          caía en la lista completa (todas las transacciones, no solo las
          pendientes) sin forma fácil de identificar cuáles eran las que
          faltaban. Con ?categoria=sin_categorizar cae directo en la vista
          filtrada, que además ahora muestra TODO el historial pendiente, no
          solo el mes en curso. */}
          {restantes > 0 && (
            <Link href="/dashboard/gastos?categoria=sin_categorizar" className="block px-4 py-2.5 text-center text-xs font-medium text-teal hover:opacity-80">
              Ver los {restantes} restantes en Gastos →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
