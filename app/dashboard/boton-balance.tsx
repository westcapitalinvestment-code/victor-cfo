"use client";

// Botón dentro de la tarjeta de balance (plan gratis): abre el panel "Tu
// balance de hoy" de MetricasGratis (que escucha este evento) y baja hasta él.
export default function BotonBalance({ texto }: { texto: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("vc-abrir-balance"))}
      className="mt-3 rounded-pill bg-white px-4 py-2 text-xs font-semibold text-teal hover:opacity-90"
    >
      {texto}
    </button>
  );
}
