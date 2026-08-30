"use client";

import { useState } from "react";

export default function ReferralLink({ userId }: { userId: string }) {
  const [copiado, setCopiado] = useState(false);

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/registro?ref=${userId}`
      : `https://www.victorcfo.com/registro?ref=${userId}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles — el link ya está seleccionable a mano.
    }
  }

  return (
    <div className="vc-card mb-4">
      <p className="text-xs uppercase tracking-wide text-muted">Invita y gana descuento para ellos</p>
      <p className="mt-1 text-sm text-text">
        Comparte tu link — quien se registre con él paga Core con descuento ($12.99/mes en vez de $14.99).
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="vc-input flex-1 !py-2 text-xs"
        />
        <button onClick={copiar} className="rounded-lg border border-teal px-3 py-2 text-xs font-medium text-teal">
          {copiado ? "¡Copiado!" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
