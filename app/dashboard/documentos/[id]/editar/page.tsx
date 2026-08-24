"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ArchivoGuardado = { id: string; etiqueta: string | null };
type ArchivoPendiente = { localId: string; file: File; etiqueta: string };

// Editar/eliminar un documento existente — mismo patrón que
// metas/[id]/editar/page.tsx. Además permite ver, agregar y eliminar
// archivos (Cloudflare R2) individualmente — un documento puede tener
// varios (ej. frente/atrás de una licencia), cada uno con su etiqueta.
export default function EditarDocumentoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const inputCamaraRef = useRef<HTMLInputElement>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("Otro");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [archivosGuardados, setArchivosGuardados] = useState<ArchivoGuardado[]>([]);
  const [borrandoArchivoId, setBorrandoArchivoId] = useState<string | null>(null);
  const [archivosPendientes, setArchivosPendientes] = useState<ArchivoPendiente[]>([]);

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

      const [{ data: doc, error: fetchError }, { data: archivos, error: archivosError }] = await Promise.all([
        supabase
          .from("documents")
          .select("id, nombre, tipo, fecha_vencimiento")
          .eq("id", params.id)
          .eq("owner_id", user.id)
          .single(),
        supabase
          .from("document_files")
          .select("id, etiqueta")
          .eq("document_id", params.id)
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true }),
      ]);

      if (fetchError || !doc) {
        setError(fetchError?.message ?? "No se encontró ese documento.");
        setFetching(false);
        return;
      }

      setNombre(doc.nombre);
      setTipo(doc.tipo ?? "Otro");
      setFechaVencimiento(doc.fecha_vencimiento ?? "");
      if (!archivosError && archivos) setArchivosGuardados(archivos);
      setFetching(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  function agregarArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setArchivosPendientes((prev) => [
      ...prev,
      ...files.map((file) => ({ localId: `${Date.now()}-${Math.random()}`, file, etiqueta: "" })),
    ]);
    e.target.value = "";
  }

  function actualizarEtiquetaPendiente(localId: string, etiqueta: string) {
    setArchivosPendientes((prev) => prev.map((a) => (a.localId === localId ? { ...a, etiqueta } : a)));
  }

  function quitarPendiente(localId: string) {
    setArchivosPendientes((prev) => prev.filter((a) => a.localId !== localId));
  }

  async function eliminarArchivoGuardado(fileId: string) {
    setBorrandoArchivoId(fileId);
    setError(null);

    const res = await fetch(`/api/documentos/archivo/${fileId}`, { method: "DELETE" });

    setBorrandoArchivoId(null);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo eliminar el archivo.");
      return;
    }

    setArchivosGuardados((prev) => prev.filter((a) => a.id !== fileId));
  }

  async function guardarCambios() {
    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("documents")
      .update({ nombre, tipo, fecha_vencimiento: fechaVencimiento || null })
      .eq("id", params.id);

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    for (const archivo of archivosPendientes) {
      const formData = new FormData();
      formData.append("file", archivo.file);
      formData.append("documentId", params.id);
      formData.append("etiqueta", archivo.etiqueta);

      const res = await fetch("/api/documentos/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoading(false);
        setError(data.error ?? "Los datos se guardaron, pero algún archivo no se pudo subir. Intenta de nuevo.");
        return;
      }
    }

    setLoading(false);
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

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Archivos</label>

          {archivosGuardados.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1">
              {archivosGuardados.map((a, i) => (
                <li key={a.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                  <span>{a.etiqueta || `Archivo ${i + 1}`}</span>
                  <span className="flex items-center gap-3 text-xs">
                    <a
                      href={`/api/documentos/archivo/${a.id}/ver`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-teal underline"
                    >
                      Ver
                    </a>
                    <button
                      type="button"
                      className="font-medium text-red underline disabled:opacity-50"
                      disabled={borrandoArchivoId === a.id}
                      onClick={() => eliminarArchivoGuardado(a.id)}
                    >
                      {borrandoArchivoId === a.id ? "..." : "Eliminar"}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <input
            ref={inputCamaraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={agregarArchivos}
          />
          <input
            ref={inputArchivoRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={agregarArchivos}
          />

          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-pill border border-border py-2 text-sm font-medium hover:opacity-80"
              onClick={() => inputCamaraRef.current?.click()}
            >
              📷 Tomar foto
            </button>
            <button
              type="button"
              className="flex-1 rounded-pill border border-border py-2 text-sm font-medium hover:opacity-80"
              onClick={() => inputArchivoRef.current?.click()}
            >
              📁 Agregar archivo(s)
            </button>
          </div>

          {archivosPendientes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {archivosPendientes.map((a) => (
                <li key={a.localId} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-muted">{a.file.name}</p>
                    <input
                      className="vc-input mt-1"
                      placeholder="Etiqueta (opcional) — ej. Frente, Página 2"
                      value={a.etiqueta}
                      onChange={(e) => actualizarEtiquetaPendiente(a.localId, e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-red underline"
                    onClick={() => quitarPendiente(a.localId)}
                  >
                    quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
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
