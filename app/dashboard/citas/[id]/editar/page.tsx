"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EditarCitaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState("");
  const [fechaOriginal, setFechaOriginal] = useState("");
  const [hora, setHora] = useState("");
  const [horaOriginal, setHoraOriginal] = useState("");
  const [costoEstimado, setCostoEstimado] = useState("");
  const [notas, setNotas] = useState("");
  const [hecha, setHecha] = useState(false);

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

      const { data: cita, error: fetchError } = await supabase
        .from("citas")
        .select("id, titulo, fecha, hora, costo_estimado, notas, hecha")
        .eq("id", params.id)
        .eq("owner_id", user.id)
        .single();

      if (fetchError || !cita) {
        setError(fetchError?.message ?? "No se encontró esa cita.");
        setFetching(false);
        return;
      }

      setTitulo(cita.titulo);
      setFecha(cita.fecha);
      setFechaOriginal(cita.fecha);
      setHora(cita.hora ?? "");
      setHoraOriginal(cita.hora ?? "");
      setCostoEstimado(cita.costo_estimado !== null ? String(cita.costo_estimado) : "");
      setNotas(cita.notas ?? "");
      setHecha(cita.hecha ?? false);
      setFetching(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function guardarCambios() {
    setLoading(true);
    setError(null);

    const cambioFechaUOra = fecha !== fechaOriginal || hora !== horaOriginal;

    const { error: updateError } = await supabase
      .from("citas")
      .update({
        titulo,
        fecha,
        hora: hora || null,
        costo_estimado: costoEstimado ? Number(costoEstimado) : null,
        notas: notas || null,
        hecha,
        updated_at: new Date().toISOString(),
        ...(cambioFechaUOra ? { recordatorio_1dia: false, recordatorio_mismodia: false } : {}),
      })
      .eq("id", params.id);

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    setLoading(false);
    router.push("/dashboard/citas");
    router.refresh();
  }

  async function eliminarCita() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);

    const { error: deleteError } = await supabase.from("citas").delete().eq("id", params.id);

    setDeleting(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    router.push("/dashboard/citas");
    router.refresh();
  }

  if (fetching) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <p className="text-sm text-muted">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Editar cita</h1>
        <button onClick={() => router.push("/dashboard/citas")} className="text-sm text-muted hover:opacity-80">
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

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hecha} onChange={(e) => setHecha(e.target.checked)} />
          Ya pasó / completada (deja de generar avisos)
        </label>

        <button className="vc-btn-primary mt-1" disabled={!titulo || !fecha || loading} onClick={guardarCambios}>
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>

        <button
          className="mt-1 rounded-pill border border-red py-2 text-sm font-medium text-red disabled:opacity-50"
          disabled={deleting}
          onClick={eliminarCita}
        >
          {deleting ? "Eliminando..." : confirmDelete ? "¿Seguro? Toca de nuevo para eliminar" : "Eliminar cita"}
        </button>
      </div>
    </div>
  );
}
