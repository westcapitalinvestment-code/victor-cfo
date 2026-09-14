"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Botón "Reiniciar demo" (14 sept 2026, pedido de Joel) — solo se renderiza
// en Configuración cuando users.is_demo = true (ver config/page.tsx). Un
// click borra perfil + chat de VICTOR de esta cuenta y la manda de vuelta a
// /onboarding, dejando intacta la data de negocio (AireFrío PR) ya
// sembrada — pensado para usarlo entre cada visitante de una presentación
// en vivo, sin tener que abrir Supabase.
export default function ReiniciarDemo() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reiniciar() {
    if (!confirm("¿Reiniciar el perfil y el chat de VICTOR para el próximo visitante? (Los datos de AireFrío PR no se tocan.)")) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/config/reiniciar-demo", { method: "POST" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setLoading(false);
      setError(json?.error || "No se pudo reiniciar. Intenta de nuevo.");
      return;
    }
    router.push("/onboarding");
    router.refresh();
  }

  return (
    <div className="vc-card mb-4 border border-teal/30" style={{ background: "rgba(29,158,117,.05)" }}>
      <p className="text-sm font-semibold text-teal">Cuenta demo</p>
      <p className="mt-1 text-xs text-muted">
        Borra el nombre, apodo, edad e hijos del perfil, y el historial de chat con VICTOR — para el próximo
        visitante. La data de negocio (AireFrío PR: clientes, facturas, pagos) NO se toca.
      </p>
      {error && <p className="mt-2 text-xs text-red">{error}</p>}
      <button onClick={reiniciar} disabled={loading} className="vc-btn-primary mt-3 w-full">
        {loading ? "Reiniciando..." : "Reiniciar demo (nuevo visitante)"}
      </button>
    </div>
  );
}
