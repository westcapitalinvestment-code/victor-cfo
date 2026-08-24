"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Bóveda Inteligente — guarda la metadata (nombre, tipo, fecha de
// vencimiento) y, si el usuario lo sube, el archivo real (foto o PDF) en
// Cloudflare R2. El archivo es opcional: sin él, el documento igual sirve
// para la alerta de vencimiento — pero si se sube, queda accesible desde
// "Ver archivo" en la Bóveda y en Editar.
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
  const [archivo, setArchivo] = useState<File | null>(null);

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setArchivo(file ?? null);
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

    // El archivo se sube DESPUÉS de crear la fila — si esto falla, el
    // documento igual queda guardado (con r2_key null), así que no se
    // pierde la fecha de vencimiento por un problema de subida.
    if (archivo) {
      const formData = new FormData();
      formData.append("file", archivo);
      formData.append("documentId", nuevo.id);

      const res = await fetch("/api/documentos/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoading(false);
        setError(
          data.error ??
            "El documento se guardó, pero el archivo no se pudo subir. Puedes intentar de nuevo desde Editar."
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
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Archivo (opcional)</label>

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
            onChange={elegirArchivo}
          />
          <input
            ref={inputArchivoRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={elegirArchivo}
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
              📁 Elegir archivo
            </button>
          </div>

          {archivo && (
            <p className="mt-2 text-xs text-muted">
              Seleccionado: {archivo.name} ·{" "}
              <button type="button" className="text-teal underline" onClick={() => setArchivo(null)}>
                quitar
              </button>
            </p>
          )}
        </div>

        <button className="vc-btn-primary mt-1" disabled={!nombre || !fechaVencimiento || loading} onClick={crearDocumento}>
          {loading ? "Guardando..." : "Guardar documento"}
        </button>
      </div>
    </div>
  );
}
