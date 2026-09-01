"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Entidad = { id: string; name: string; logo_r2_key: string | null };

export default function EditarLogoForm({ entidad }: { entidad: Entidad }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tieneLogo, setTieneLogo] = useState(!!entidad.logo_r2_key);
  const [subiendo, setSubiendo] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fuerza a que <img> vuelva a pedir la imagen después de subir/borrar
  // (si no, el navegador se queda con la versión vieja en caché).
  const [version, setVersion] = useState(0);

  async function subirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setSubiendo(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityId", entidad.id);

    const res = await fetch("/api/entidades/logo/upload", { method: "POST", body: formData });
    setSubiendo(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo subir el logo.");
      return;
    }

    setTieneLogo(true);
    setVersion((v) => v + 1);
  }

  async function borrarLogo() {
    setBorrando(true);
    setError(null);
    const res = await fetch(`/api/entidades/${entidad.id}/logo`, { method: "DELETE" });
    setBorrando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo quitar el logo.");
      return;
    }
    setTieneLogo(false);
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Logo — {entidad.name}</h1>
        <button onClick={() => router.push("/dashboard/config")} className="text-sm text-muted hover:opacity-80">
          Volver
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <p className="text-xs text-muted">
          Este logo aparece en el encabezado de tus facturas y cotizaciones en PDF. Recomendado: PNG o JPG, fondo
          transparente si lo tienes, no más de 5MB.
        </p>

        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border bg-bg">
          {tieneLogo ? (
            <img
              src={`/api/entidades/${entidad.id}/logo?v=${version}`}
              alt="Logo actual"
              className="max-h-28 max-w-[90%] object-contain"
            />
          ) : (
            <p className="text-xs text-muted">Todavía no tienes un logo — se ve así de vacío en el PDF por ahora.</p>
          )}
        </div>

        <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={subirLogo} />

        <div className="flex gap-2">
          <button
            type="button"
            disabled={subiendo}
            className="vc-btn-primary flex-1"
            onClick={() => inputRef.current?.click()}
          >
            {subiendo ? "Subiendo..." : tieneLogo ? "Reemplazar logo" : "Subir logo"}
          </button>
          {tieneLogo && (
            <button
              type="button"
              disabled={borrando}
              className="flex-shrink-0 rounded-pill border border-red px-4 text-sm font-medium text-red hover:opacity-80"
              onClick={borrarLogo}
            >
              {borrando ? "..." : "Quitar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
