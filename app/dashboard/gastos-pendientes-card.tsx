"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CategoriaComboBox from "./categoria-combobox";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

type Categoria = { id: number; nombre: string };

export { default as CategoriaComboBox } from "./categoria-combobox";

type Pendiente = {
  id: string;
  description_raw: string;
  amount: number;
  fecha: string;
  sugeridaId: number | null;
  tipo_flujo?: "gasto" | "ingreso" | "transferencia";
  pending?: boolean;
  cuentaLabel?: string | null;
};

export default function GastosPendientesCard({
  pendientesIniciales,
  totalPendientes,
  categorias,
  // A dónde manda "Ver los N restantes en Transacciones →" — Personal usa
  // /dashboard/gastos (default), Negocio manda /dashboard/negocio/gastos
  // para quedarse dentro del contexto de la entidad activa (4 sept 2026,
  // pedido de Joel: esta tarjeta también debía existir en el Inicio de
  // negocio, no solo en Personal).
  hrefBase = "/dashboard/gastos",
  // Botones para ver solo las pendientes de una cuenta/tarjeta (20 nov 2026).
  filtros = [],
}: {
  pendientesIniciales: Pendiente[];
  totalPendientes: number;
  categorias: Categoria[];
  hrefBase?: string;
  filtros?: { clave: string; nombre: string; n: number; href: string; activo: boolean }[];
}) {
  const router = useRouter();
  const [pendientes, setPendientes] = useState(pendientesIniciales);
  // Categorías creadas al vuelo desde el combobox se suman aquí.
  const [cats, setCats] = useState(categorias);
  useEffect(() => setCats(categorias), [categorias]);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(true);
  // Cuál fila tiene el combobox de categoría abierto (24 sept 2026) —
  // reemplaza el <select> nativo que obligaba a hacer scroll por todas las
  // categorías; null = ninguna fila en modo edición.
  const [editando, setEditando] = useState<string | null>(null);

  // useState(pendientesIniciales) solo usa ese valor en el PRIMER render —
  // si el Server Component padre (page.tsx) vuelve a correr con datos
  // frescos (ej. router.refresh() disparado desde victor-chat.tsx cuando
  // VICTOR categoriza algo por el chat), React no reinicia este estado
  // solo porque cambió el prop. Mismo bug de fondo que CuentasManuales
  // (ver ese archivo) pero con un síntoma distinto: aquí sí se re-renderiza
  // el componente, solo que con el estado viejo. Sin este efecto, VICTOR
  // podía categorizar algo por el chat y esta tarjeta seguía mostrándolo
  // como pendiente hasta que el usuario recargara a mano.
  useEffect(() => {
    setPendientes(pendientesIniciales);
  }, [pendientesIniciales]);

  const nombreCategoria = (id: number | null) => cats.find((c) => c.id === id)?.nombre ?? null;

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

  if (pendientes.length === 0 && !filtros.some((f) => f.activo && f.clave !== "todas")) return null;

  const restantes = totalPendientes - pendientesIniciales.length;

  return (
    <div id="pendientes" className="vc-card mb-3 !p-0 border-amb">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🏷️</span>
          <div>
            <p className="text-sm font-medium text-text">
              {pendientes.length} transacci{pendientes.length > 1 ? "ones" : "ón"} sin categorizar
            </p>
            <p className="text-[11px] text-muted">Toca cada uno para categorizarlo o acepta la sugerencia</p>
          </div>
        </div>
        <span className="text-xs text-muted">{abierto ? "▲" : "▼"}</span>
      </button>

      {abierto && filtros.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-border px-4 py-2">
          {filtros.map((f) => (
            <Link
              key={f.clave}
              href={f.href}
              scroll={false}
              className={`flex-shrink-0 rounded-pill border px-2.5 py-1 text-[11px] font-medium ${
                f.activo ? "border-teal bg-teal text-white" : "border-border text-muted"
              }`}
            >
              {f.nombre} ({f.n})
            </Link>
          ))}
        </div>
      )}
      {abierto && pendientes.length === 0 && (
        <p className="border-t border-border px-4 py-3 text-sm text-muted">Esta cuenta no tiene transacciones por categorizar. ✓</p>
      )}
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
                  {p.fecha}
                  {p.cuentaLabel ? ` · ${p.cuentaLabel}` : ""} ·{" "}
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
              {editando === p.id ? (
                <CategoriaComboBox
                  categorias={cats}
                  onCreada={(c) => setCats((prev) => [...prev, c].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
                  disabled={guardando === p.id}
                  onSeleccionar={(id) => {
                    setEditando(null);
                    categorizar(p.id, id);
                  }}
                  onCerrar={() => setEditando(null)}
                />
              ) : (
                <button
                  type="button"
                  className="vc-input !w-auto flex-shrink-0 !py-1.5 !text-xs"
                  disabled={guardando === p.id}
                  onClick={() => setEditando(p.id)}
                >
                  {guardando === p.id ? "Guardando..." : p.sugeridaId ? `¿${nombreCategoria(p.sugeridaId)}?` : "Categoría..."}
                </button>
              )}
            </div>
          ))}

          {/* Antes esto mandaba a /dashboard/gastos sin filtro — el usuario
          caía en la lista completa (todas las transacciones, no solo las
          pendientes) sin forma fácil de identificar cuáles eran las que
          faltaban. Con ?categoria=sin_categorizar cae directo en la vista
          filtrada, que además ahora muestra TODO el historial pendiente, no
          solo el mes en curso. */}
          {restantes > 0 && (
            <Link href={`${hrefBase}${hrefBase.includes("?") ? "&" : "?"}categoria=sin_categorizar`} className="block px-4 py-2.5 text-center text-xs font-medium text-teal hover:opacity-80">
              Ver los {restantes} restantes en Transacciones →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
