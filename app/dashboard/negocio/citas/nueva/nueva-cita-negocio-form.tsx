"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Igual que app/dashboard/citas/nueva/page.tsx pero con entity_id fijo (la
// entidad activa, resuelta server-side) — sin placeholders de ejemplo, misma
// regla que ya aplica en Metas/Bóveda de negocio (1 sept 2026).
export default function NuevaCitaNegocioForm({ entidadId }: { entidadId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [costoEstimado, setCostoEstimado] = useState("");
  const [notas, setNotas] = useState("");

  async function crearCita() {
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

    const { error: insertError } = await supabase.from("citas").insert({
      owner_id: user.id,
      entity_id: entidadId,
      titulo,
      fecha,
      hora: hora || null,
      costo_estimado: costoEstimado ? Number(costoEstimado) : null,
      notas: notas || null,
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/dashboard/negocio/citas");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Nueva cita de negocio</h1>
        <button onClick={() => router.push("/dashboard/negocio/citas")} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Título</label>
          <input className="vc-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Fecha</label>
            <input className="vc-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Hora (opcional)</label>
            <input className="vc-input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Costo estimado (opcional)</label>
          <input
            className="vc-input"
            type="number"
            step="0.01"
            value={costoEstimado}
            onChange={(e) => setCostoEstimado(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Notas (opcional)</label>
          <textarea className="vc-input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        <button className="vc-btn-primary mt-1" disabled={!titulo || !fecha || loading} onClick={crearCita}>
          {loading ? "Guardando..." : "Guardar cita"}
        </button>
      </div>
    </div>
  );
}
