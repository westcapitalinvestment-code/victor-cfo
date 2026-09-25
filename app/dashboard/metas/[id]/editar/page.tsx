"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

// Editar/eliminar una meta existente — mismo patrón que nueva/page.tsx
// (cliente de Supabase del navegador, RLS aplica normal), pero cargando
// la fila primero y con un botón de borrar aparte con confirmación.
//
// Compartida entre Metas personal y Metas de negocio (1 sept 2026) — el
// ?volver= le dice a dónde regresar (default /dashboard/metas). No se usa
// useSearchParams a propósito: ese hook obliga a envolver la página en
// <Suspense> o el build de Next puede fallar — como esta página ya es
// "use client" sin wrapper de servidor, es más simple y seguro leer el
// query string directo del navegador.
function volverDestino(): string {
  if (typeof window === "undefined") return "/dashboard/metas";
  return new URLSearchParams(window.location.search).get("volver") || "/dashboard/metas";
}

// Calculadora de ahorro (25 sept 2026) — matemática pura, cero IA: dado lo
// que falta por ahorrar y la fecha límite, cuánto hay que apartar cada mes
// (y cada semana) para llegar a tiempo. Es justo el tipo de cálculo que
// cualquier plan (incluido el gratis) puede tener gratis de verdad, sin
// depender de VICTOR ni de ninguna llamada a Claude.
//
// 30.44 días/mes (365.25 / 12) en vez de asumir "30 días" a fuego — con
// "30 días" fijo, una meta a 11 meses exactos calculaba mal el número de
// meses restantes por el redondeo acumulado de los meses de 31 días.
const DIAS_POR_MES = 365.25 / 12;

type CalculoAhorro =
  | { estado: "lista" } // ya se alcanzó el monto objetivo
  | { estado: "sin_fecha" }
  | { estado: "fecha_vencida" }
  | { estado: "calculado"; faltante: number; diasRestantes: number; porMes: number; porSemana: number };

function calcularAhorroMensual(targetAmount: number, currentAmount: number, targetDateStr: string): CalculoAhorro {
  const faltante = targetAmount - currentAmount;
  if (faltante <= 0) return { estado: "lista" };
  if (!targetDateStr) return { estado: "sin_fecha" };

  // Parseo manual (no new Date(targetDateStr) a secas) para anclar la
  // fecha límite a medianoche LOCAL, no UTC — mismo espíritu que
  // lib/hora-pr.ts: un <input type="date"> devuelve "YYYY-MM-DD", y
  // interpretarlo como UTC corre la fecha un día para atrás en zonas
  // horarias negativas (como Puerto Rico, UTC-4) pasado cierto punto.
  const [anio, mes, dia] = targetDateStr.split("-").map(Number);
  const limite = new Date(anio, mes - 1, dia);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const msPorDia = 24 * 60 * 60 * 1000;
  const diasRestantes = Math.round((limite.getTime() - hoy.getTime()) / msPorDia);
  if (diasRestantes <= 0) return { estado: "fecha_vencida" };

  const mesesRestantes = Math.max(diasRestantes / DIAS_POR_MES, 1 / 4); // piso de 1 semana en meses
  const semanasRestantes = Math.max(diasRestantes / 7, 1);

  return {
    estado: "calculado",
    faltante,
    diasRestantes,
    porMes: faltante / mesesRestantes,
    porSemana: faltante / semanasRestantes,
  };
}

export default function EditarMetaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  // Fecha límite (25 sept 2026) — mismo campo que se añadió a Nueva meta,
  // aquí además alimenta la calculadora de ahorro de abajo.
  const [targetDate, setTargetDate] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Sesión expirada — vuelve a entrar.");
        setFetching(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("goals")
        .select("id, name, target_amount, current_amount, target_date")
        .eq("id", params.id)
        .eq("owner_id", user.id)
        .single();

      if (fetchError || !data) {
        setError(fetchError?.message ?? "No se encontró esa meta.");
        setFetching(false);
        return;
      }

      setName(data.name);
      setTargetAmount(String(data.target_amount));
      setCurrentAmount(String(data.current_amount ?? 0));
      setTargetDate(data.target_date ?? "");
      setFetching(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function guardarCambios() {
    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("goals")
      .update({
        name,
        target_amount: Number(targetAmount),
        current_amount: Number(currentAmount) || 0,
        target_date: targetDate || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push(volverDestino());
    router.refresh();
  }

  async function eliminarMeta() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);

    const { error: deleteError } = await supabase.from("goals").delete().eq("id", params.id);

    setDeleting(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    router.push(volverDestino());
    router.refresh();
  }

  if (fetching) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <p className="text-sm text-muted">Cargando…</p>
      </div>
    );
  }

  // Se recalcula en cada render a partir de los inputs en pantalla (no
  // useState/useEffect aparte) — así, si el usuario cambia el monto o la
  // fecha, la calculadora de abajo se actualiza sola sin un botón de
  // "recalcular".
  const calculo = calcularAhorroMensual(Number(targetAmount) || 0, Number(currentAmount) || 0, targetDate);

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Editar meta</h1>
        <button onClick={() => router.push(volverDestino())} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Nombre de la meta</label>
          <input className="vc-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Monto objetivo</label>
          <input
            className="vc-input"
            type="number"
            step="0.01"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Ya tienes ahorrado</label>
          <input
            className="vc-input"
            type="number"
            step="0.01"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Fecha límite (opcional)</label>
          <input
            className="vc-input"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </div>

        {/* Calculadora de ahorro (25 sept 2026) — matemática pura sobre lo
            que falta y la fecha límite, sin IA de por medio. Vive aquí (no
            en la lista de Metas) porque necesita el monto/fecha que el
            usuario está editando en este momento, no solo lo ya guardado
            en la base de datos — así se actualiza mientras escribe, antes
            de darle a "Guardar cambios". */}
        {calculo.estado === "calculado" && (
          <div className="rounded-lg border border-border bg-bg p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Cuánto ahorrar para llegar a tiempo</p>
            <p className="mt-1 text-sm text-text">
              Te faltan <span className="font-medium">{formatMoney(calculo.faltante)}</span> y tienes{" "}
              {calculo.diasRestantes} días hasta la fecha límite.
            </p>
            <div className="mt-2 flex gap-4">
              <div>
                <p className="text-lg font-medium text-teal">{formatMoney(calculo.porMes)}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted">por mes</p>
              </div>
              <div>
                <p className="text-lg font-medium text-teal">{formatMoney(calculo.porSemana)}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted">por semana</p>
              </div>
            </div>
          </div>
        )}
        {calculo.estado === "lista" && (
          <p className="text-xs text-grn">Ya tienes el monto completo ahorrado — ¡meta lograda! 🎉</p>
        )}
        {calculo.estado === "fecha_vencida" && (
          <p className="text-xs text-amb">
            La fecha límite ya pasó — actualízala arriba para ver cuánto te falta ahorrar por mes.
          </p>
        )}
        {calculo.estado === "sin_fecha" && (
          <p className="text-xs text-muted">Agrega una fecha límite arriba para ver cuánto ahorrar al mes y a la semana.</p>
        )}

        <button
          className="vc-btn-primary mt-1"
          disabled={!name || !targetAmount || loading}
          onClick={guardarCambios}
        >
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>

        <button
          className="mt-1 rounded-pill border border-red py-2 text-sm font-medium text-red disabled:opacity-50"
          disabled={deleting}
          onClick={eliminarMeta}
        >
          {deleting ? "Eliminando..." : confirmDelete ? "¿Seguro? Toca de nuevo para eliminar" : "Eliminar meta"}
        </button>
      </div>
    </div>
  );
}
