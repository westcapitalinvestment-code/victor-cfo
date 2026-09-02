"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Igual que nueva-meta-negocio-form.tsx del dueño, pero con owner_id
// forzado al owner_id EFECTIVO (el dueño, no el admin logueado) — ver
// lib/owner-efectivo.ts.
export default function NuevaMetaAdminForm({ entidadId, ownerIdEfectivo }: { entidadId: string; ownerIdEfectivo: string }) {
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

    const { error: insertError } = await supabase.from("goals").insert({
      owner_id: ownerIdEfectivo,
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

    router.push(`/admin/${entidadId}/metas`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Nueva meta de negocio</h1>
        <button onClick={() => router.push(`/admin/${entidadId}/metas`)} className="text-sm text-muted hover:opacity-80">
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
