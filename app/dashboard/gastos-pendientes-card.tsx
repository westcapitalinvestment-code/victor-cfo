"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

type Categoria = { id: number; nombre: string };

// Combobox con búsqueda (24 sept 2026, pedido de Joel: con muchas
// categorías el <select> nativo obliga a hacer scroll — escribir "vida" y
// que filtre a "Seguros de vida" es mucho más rápido). Mismo patrón que
// CategoriaComboBox en app/dashboard/gastos/gastos-list.tsx — vive a nivel
// de módulo (no adentro de GastosPendientesCard) por la misma razón: que
// React no lo desmonte/remonte en cada render del padre y se pierda lo que
// el usuario ya escribió.
function CategoriaComboBox({
  categorias,
  disabled,
  onSeleccionar,
  onCerrar,
}: {
  categorias: Categoria[];
  disabled?: boolean;
  onSeleccionar: (id: number) => void;
  onCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCerrar();
      }
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtradas = busqueda.trim()
    ? categorias.filter((c) => c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : categorias;

  return (
    <div className="relative" ref={ref}>
      <input
        autoFocus
        className="vc-input !w-36 !py-1.5 !text-xs"
        placeholder="Buscar categoría..."
        disabled={disabled}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      <div className="absolute right-0 z-20 mt-1 max-h-48 w-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
        {filtradas.length === 0 && <p className="p-2 text-xs text-muted">Sin resultados.</p>}
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
  // A dónde manda "Ver los N restantes en Transacciones →" — Personal usa
  // /dashboard/gastos (default), Negocio manda /dashboard/negocio/gastos
  // para quedarse dentro del contexto de la entidad activa (4 sept 2026,
  // pedido de Joel: esta tarjeta también debía existir en el Inicio de
  // negocio, no solo en Personal).
  hrefBase = "/dashboard/gastos",
}: {
  pendientesIniciales: Pendiente[];
  totalPendientes: number;
  categorias: Categoria[];
  hrefBase?: string;
}) {
  const router = useRouter();
  const [pendientes, setPendientes] = useState(pendientesIniciales);
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
              {pendientes.length} transacci{pendientes.length > 1 ? "ones" : "ón"} sin categorizar
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
                  categorias={categorias}
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
            <Link href={`${hrefBase}?categoria=sin_categorizar`} className="block px-4 py-2.5 text-center text-xs font-medium text-teal hover:opacity-80">
              Ver los {restantes} restantes en Transacciones →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
