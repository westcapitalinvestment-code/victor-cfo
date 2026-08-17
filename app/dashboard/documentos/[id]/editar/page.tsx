"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Editar/eliminar un documento existente — mismo patrón que
// metas/[id]/editar/page.tsx.
export default function EditarDocumentoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("Otro");
  const [fechaVencimiento, setFechaVencimiento] = useState("");

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
        .from("documents")
        .select("id, nombre, tipo, fecha_vencimiento")
        .eq("id", params.id)
        .eq("owner_id", user.id)
        .single();

      if (fetchError || !data) {
        setError(fetchError?.message ?? "No se encontró ese documento.");
        setFetching(false);
        return;
      }

      setNombre(data.nombre);
      setTipo(data.tipo ?? "Otro");
      setFechaVencimiento(data.fecha_vencimiento ?? "");
      setFetching(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function guardarCambios() {
    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("documents")
      .update({ nombre, tipo, fecha_vencimiento: fechaVencimiento || null })
      .eq("id", params.id);

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/dashboard/documentos");
    router.refresh();
  }

  async function eliminarDocumento() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);

    const { error: deleteError } = await supabase.from("documents").delete().eq("id", params.id);

    setDeleting(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    router.push("/dashboard/documentos");
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
        <h1 className="text-lg font-medium">Editar documento</h1>
        <button onClick={() => router.push("/dashboard/documentos")} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Nombre del documento</label>
          <input className="vc-input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tipo</label>
          <select className="vc-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option>Seguro</option>
            <option>Permiso</option>
            <option>Contrato</option>
            <option>Licencia</option>
            <option>Otro</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Fecha de vencimiento</label>
          <input
            className="vc-input"
            type="date"
            value={fechaVencimiento}
            onChange={(e) => setFechaVencimiento(e.target.value)}
          />
        </div>

        <button className="vc-btn-primary mt-1" disabled={!nombre || loading} onClick={guardarCambios}>
          {loading ? "Guardando..." : "Guardar cambios"}
        </button>

        <button
          className="mt-1 rounded-pill border border-red py-2 text-sm font-medium text-red disabled:opacity-50"
          disabled={deleting}
          onClick={eliminarDocumento}
        >
          {deleting ? "Eliminando..." : confirmDelete ? "¿Seguro? Toca de nuevo para eliminar" : "Eliminar documento"}
        </button>
      </div>
    </div>
  );
}
