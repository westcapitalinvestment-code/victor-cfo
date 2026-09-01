"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Botón "No es duplicado" — le pega a /api/transacciones/marcar-duplicada
// con esDuplicada:false y refresca la lista. No borra nada: la
// transacción simplemente vuelve a aparecer en Gastos/Resumen/Inicio
// normalmente.
export default function DesmarcarBoton({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function desmarcar() {
    setCargando(true);
    try {
      const res = await fetch("/api/transacciones/marcar-duplicada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, esDuplicada: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "No se pudo desmarcar la transacción.");
        setCargando(false);
        return;
      }
      router.refresh();
    } catch {
      alert("No se pudo desmarcar la transacción.");
      setCargando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={desmarcar}
      disabled={cargando}
      className="rounded-pill border px-3 py-1.5 text-xs font-medium text-teal hover:opacity-80 disabled:opacity-50"
      style={{ borderColor: "var(--border)" }}
    >
      {cargando ? "Desmarcando…" : "No es duplicado"}
    </button>
  );
}
