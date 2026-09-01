"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Igual que app/dashboard/metas/nueva/page.tsx pero con entity_id fijo (la
// entidad activa, resuelta server-side) — y sin placeholders con montos de
// ejemplo, por la misma regla de "todo en blanco" que ya aplica en
// Clientes/Entidad (1 sept 2026).
export default function NuevaMetaNegocioForm({ entidadId }: { entidadId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("");

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
      entity_id: entidadId,
      name,
      target_amount: Number(targetAmount),
      current_amount: Number(currentAmount) || 0,
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/dashboard/negocio/metas");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Nueva meta de negocio</h1>
        <button onClick={() => router.push("/dashboard/negocio/metas")} className="text-sm text-muted hover:opacity-80">
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
          <input className="vc-input" type="number" step="0.01" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Ya tienes ahorrado (opcional)</label>
          <input className="vc-input" type="number" step="0.01" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} />
        </div>

        <button className="vc-btn-primary mt-1" disabled={!name || !targetAmount || loading} onClick={crearMeta}>
          {loading ? "Guardando..." : "Guardar meta"}
        </button>
      </div>
    </div>
  );
}
