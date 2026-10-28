"use client";

import { useEffect, useState } from "react";

// Posibles duplicados de oficinas de contables (solo founder). Una ficha creada
// por un vendedor + otra que el contable abrió con su portal, con el mismo
// nombre y pueblo pero distinto correo/teléfono. "Unir" deja una sola ficha:
// si el vendedor aún tiene su seguimiento vigente (60 días) se queda con el
// bono; si no, queda con quien ya estaba en la ficha del contable.

type Par = {
  huerfana: { id: string; nombre: string; pueblo: string | null; vendedor: string | null; vigente: boolean };
  portal: { id: string; nombre: string; pueblo: string | null; email: string | null };
};

export default function OficinasDuplicadosPanel() {
  const [pares, setPares] = useState<Par[] | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  async function cargar() {
    const r = await fetch("/api/socios/oficinas-duplicados");
    const j = r.ok ? await r.json() : null;
    setPares(j?.pares ?? []);
  }
  useEffect(() => {
    cargar();
  }, []);

  async function unir(p: Par) {
    setTrabajando(p.huerfana.id);
    await fetch("/api/socios/oficinas-duplicados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ huerfanaId: p.huerfana.id, portalId: p.portal.id }),
    });
    setTrabajando(null);
    cargar();
  }

  if (!pares || pares.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
        Posibles oficinas duplicadas ({pares.length})
      </p>
      <div className="vc-card flex flex-col gap-2">
        {pares.map((p) => (
          <div key={p.huerfana.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-xs last:border-0 last:pb-0">
            <div className="min-w-0">
              <p className="font-medium">
                {p.huerfana.nombre}
                {p.huerfana.pueblo ? ` · ${p.huerfana.pueblo}` : ""}
              </p>
              <p className="text-muted">
                Registrada por {p.huerfana.vendedor ?? "—"}
                {p.huerfana.vigente ? " (seguimiento vigente)" : ""} · parece ser la misma que «{p.portal.nombre}»
                {p.portal.email ? ` (${p.portal.email})` : ""}, que ya tiene portal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => unir(p)}
              disabled={trabajando === p.huerfana.id}
              className="shrink-0 rounded-pill bg-teal px-3 py-1.5 font-medium text-white disabled:opacity-50"
            >
              {trabajando === p.huerfana.id ? "Uniendo..." : "Unir"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
