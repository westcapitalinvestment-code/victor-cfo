"use client";

import { useState } from "react";

// Interruptores para el dueño que NO tiene el módulo Nómina: su contable
// siempre puede correr la nómina, pero solo si el dueño lo autoriza aquí.
interface Ent {
  id: string;
  name: string;
  puede: boolean;
  directo: boolean;
}

export default function PermisoContable({ entidades }: { entidades: Ent[] }) {
  const [estado, setEstado] = useState<Record<string, Ent>>(Object.fromEntries(entidades.map((e) => [e.id, e])));
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (entidades.length === 0) return null;

  async function cambiar(id: string, parcial: Partial<Pick<Ent, "puede" | "directo">>) {
    const nuevo = { ...estado[id], ...parcial };
    if (!nuevo.puede) nuevo.directo = false;
    setGuardando(id);
    setError(null);
    const r = await fetch("/api/nomina/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId: id, cpa_puede_nomina: nuevo.puede, cpa_aprueba_directo: nuevo.directo }),
    });
    setGuardando(null);
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      setError(j?.error ?? "No se pudo guardar.");
      return;
    }
    setEstado({ ...estado, [id]: nuevo });
  }

  return (
    <div className="mx-auto max-w-lg px-6 pb-8">
      <div className="vc-card">
        <p className="mb-1 text-sm font-medium">Tu contable y la nómina</p>
        <p className="mb-3 text-xs text-muted">
          Tu contable puede correr la nómina de tu negocio desde su portal sin que tengas el módulo. Tú decides si lo permites y si sus corridas quedan
          aprobadas o esperan tu autorización.
        </p>
        {entidades.map((e) => {
          const x = estado[e.id];
          return (
            <div key={e.id} className="mb-3 border-t border-border pt-2 first:border-0 first:pt-0">
              <p className="mb-1 text-xs font-medium">{e.name}</p>
              <label className="mb-1 flex items-center gap-2 text-xs">
                <input type="checkbox" checked={x.puede} disabled={guardando === e.id} onChange={(ev) => cambiar(e.id, { puede: ev.target.checked })} />
                Permitir que mi contable corra la nómina
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={x.directo} disabled={!x.puede || guardando === e.id} onChange={(ev) => cambiar(e.id, { directo: ev.target.checked })} />
                Sus corridas quedan aprobadas sin mi autorización
              </label>
            </div>
          );
        })}
        {error && <p className="text-xs text-red">{error}</p>}
      </div>
    </div>
  );
}
