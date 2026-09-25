"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NuevaMetaPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  // Fecha límite (25 sept 2026) — la columna target_date ya existía en la
  // tabla goals desde la migración 0007, pero esta pantalla nunca la
  // pedía, así que quedaba siempre en null. Sin fecha, no hay forma de
  // calcular "cuánto tengo que ahorrar al mes" — es lo que necesita la
  // calculadora de ahorro que ahora vive en Editar meta. Opcional a
  // propósito: una meta sin fecha sigue siendo válida (ej. "fondo de
  // emergencia" sin plazo fijo), solo que sin la calculadora.
  const [targetDate, setTargetDate] = useState("");

  async function crearMeta() {
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Sesión expirada — vuelve a entrar.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("goals").insert({
      owner_id: user.id,
      entity_id: null, // meta personal
      name,
      target_amount: Number(targetAmount),
      current_amount: Number(currentAmount) || 0,
      target_date: targetDate || null,
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Nueva meta</h1>
        <button onClick={() => router.push("/dashboard")} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Nombre de la meta</label>
          <input
            className="vc-input"
            placeholder="Fondo de emergencia"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Monto objetivo</label>
          <input
            className="vc-input"
            type="number"
            step="0.01"
            placeholder="5000"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Ya tienes ahorrado (opcional)</label>
          <input
            className="vc-input"
            type="number"
            step="0.01"
            placeholder="0"
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
          <p className="mt-1 text-[11px] text-muted">
            Si la pones, te calculamos cuánto ahorrar al mes para llegar a tiempo.
          </p>
        </div>

        <button className="vc-btn-primary mt-1" disabled={!name || !targetAmount || loading} onClick={crearMeta}>
          {loading ? "Guardando..." : "Guardar meta"}
        </button>
      </div>
    </div>
  );
}
