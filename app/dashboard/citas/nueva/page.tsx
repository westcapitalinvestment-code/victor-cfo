"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Nueva cita — mismo patrón que documentos/nuevo/page.tsx pero sin subida
// de archivos. hora y costo_estimado son opcionales: una cita puede
// anotarse solo con fecha (ej. "recordarme llamar al banco el jueves") o
// completa (ej. una cita médica con hora y costo aproximado a llevar).
export default function NuevaCitaPage() {
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

    router.push("/dashboard/citas");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Nueva cita</h1>
        <button onClick={() => router.push("/dashboard/citas")} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Título</label>
          <input
            className="vc-input"
            placeholder="Cita Dra. Abreu (Endodoncista)"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
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
            placeholder="760.00"
            value={costoEstimado}
            onChange={(e) => setCostoEstimado(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Notas (opcional)</label>
          <textarea
            className="vc-input"
            rows={2}
            placeholder="Qué llevar, quién la refirió, etc."
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />
        </div>

        <button className="vc-btn-primary mt-1" disabled={!titulo || !fecha || loading} onClick={crearCita}>
          {loading ? "Guardando..." : "Guardar cita"}
        </button>
      </div>
    </div>
  );
}
