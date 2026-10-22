"use client";

import { useEffect } from "react";

// Plan gratis (22 oct 2026): el Inicio calcula las alertas inteligentes y este
// componente le avisa a la campanita del topbar cuántas hay. El valor queda en
// window para que la campanita lo muestre también al navegar a otras páginas.
export const EVENTO_ALERTAS = "vc-alertas-count";

export default function AlertasSync({ n }: { n: number }) {
  useEffect(() => {
    (window as unknown as { __vcAlertas?: number }).__vcAlertas = n;
    window.dispatchEvent(new CustomEvent(EVENTO_ALERTAS, { detail: n }));
  }, [n]);
  return null;
}
