"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ArchivoPendiente = { localId: string; file: File; etiqueta: string };

// Bóveda Inteligente — guarda la metadata (nombre, tipo, fecha de
// vencimiento) y, si el usuario los sube, los archivos reales (fotos o
// PDFs) en Cloudflare R2. Los archivos son opcionales y pueden ser
// VARIOS por documento (ej. frente/atrás de una licencia, o varias
// páginas de un contrato) — cada uno con una etiqueta opcional para
// distinguirlos, ya que el nombre que pone la cámara no sirve para eso.
export default function NuevoDocumentoPage() {
  const router = useRouter();
  const supabase = createClient();

  const inputCamaraRef = useRef<HTMLInputElement>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("Otro");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [archivos, setArchivos] = useState<ArchivoPendiente[]>([]);

  function agregarArchivos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setArchivos((prev) => [
      ...prev,
      ...files.map((file) => ({ localId: `${Date.now()}-${Math.random()}`, file, etiqueta: "" })),
    ]);
    e.target.value = ""; // permite volver a elegir el mismo archivo si lo quita y lo agrega de nuevo
  }

  function actualizarEtiqueta(localId: string, etiqueta: string) {
    setArchivos((prev) => prev.map((a) => (a.localId === localId ? { ...a, etiqueta } : a)));
  }

  function quitarArchivo(localId: string) {
    setArchivos((prev) => prev.filter((a) => a.localId !== localId));
  }

  async function crearDocumento() {
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

    const { data: nuevo, error: insertError } = await supabase
      .from("documents")
      .insert({
        owner_id: user.id,
        entity_id: null,
        nombre,
        tipo,
        fecha_vencimiento: fechaVencimiento || null,
        estado: "activo",
      })
      .select("id")
      .single();

    if (insertError || !nuevo) {
      setError(insertError?.message ?? "No se pudo guardar el documento.");
      setLoading(false);
      return;
    }

    // Los archivos se suben DESPUÉS de crear la fila, uno por uno — si
    // alguno falla, el documento igual queda guardado (con los que sí
    // subieron), así que no se pierde nada por un problema de subida.
    for (const archivo of archivos) {
      const formData = new FormData();
      formData.append("file", archivo.file);
      formData.append("documentId", nuevo.id);
      formData.append("etiqueta", archivo.etiqueta);

      const res = await fetch("/api/documentos/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoading(false);
        setError(
          data.error ??
            "El documento se guardó, pero algún archivo no se pudo subir. Puedes intentar de nuevo desde Editar."
        );
        return;
      }
    }

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Nuevo documento</h1>
        <button onClick={() => router.push("/dashboard")} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Nombre del documento</label>
          <input
            className="vc-input"
            placeholder="Póliza de seguro de auto"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
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
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Archivos (opcional)</label>

          {/* capture="environment" abre la cámara trasera directo en el
              celular. En la computadora ese atributo simplemente se
              ignora y el input actúa como selector de archivo normal
              (webcam si el sistema lo ofrece, o el explorador de
              archivos) — no hace falta detectar el dispositivo. */}
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
              📁 Elegir archivo(s)
            </button>
          </div>

          {archivos.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {archivos.map((a) => (
                <li key={a.localId} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-muted">{a.file.name}</p>
                    <input
                      className="vc-input mt-1"
                      placeholder="Etiqueta (opcional) — ej. Frente, Página 2"
                      value={a.etiqueta}
                      onChange={(e) => actualizarEtiqueta(a.localId, e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-red underline"
                    onClick={() => quitarArchivo(a.localId)}
                  >
                    quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button className="vc-btn-primary mt-1" disabled={!nombre || !fechaVencimiento || loading} onClick={crearDocumento}>
          {loading ? "Guardando..." : "Guardar documento"}
        </button>
      </div>
    </div>
  );
}
