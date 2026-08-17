"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Bóveda Inteligente (versión mínima) — sin subida de archivo a Cloudflare
// R2 todavía (no está configurado). Por ahora guarda la metadata (nombre,
// tipo, fecha de vencimiento), que es justo lo que necesita la card de
// Alertas del Inicio para funcionar. El PDF/foto real se añade después
// cuando R2 esté listo — no rompe nada, r2_key se queda null hasta entonces.
export default function NuevoDocumentoPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("Otro");
  const [fechaVencimiento, setFechaVencimiento] = useState("");

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

    const { error: insertError } = await supabase.from("documents").insert({
      owner_id: user.id,
      entity_id: null,
      nombre,
      tipo,
      fecha_vencimiento: fechaVencimiento || null,
      estado: "activo",
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
        <h1 className="text-lg font-medium">Nuevo documento</h1>
        <button onClick={() => router.push("/dashboard")} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "var(--amb)", background: "rgba(154,103,0,.08)", color: "var(--amb)" }}>
          Por ahora solo guarda la fecha para avisarte antes de que venza — subir el archivo
          (Cloudflare R2) es el siguiente paso del roadmap.
        </div>

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

        <button className="vc-btn-primary mt-1" disabled={!nombre || !fechaVencimiento || loading} onClick={crearDocumento}>
          {loading ? "Guardando..." : "Guardar documento"}
        </button>
      </div>
    </div>
  );
}
