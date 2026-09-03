"use client";

import { useState } from "react";

// Envoltorio genérico de "card colapsable" para el Dashboard de
// Operaciones (3 sept 2026, pedido de Joel: "en mi pantalla de dashborad
// colapasame todas las card" — la pantalla se hacía muy larga con todo
// expandido de una vez). El contenido (children) puede ser JSX armado en
// el Server Component de la página — Next.js permite pasar árboles ya
// renderizados por el servidor como children de un Client Component sin
// que ese contenido en sí necesite ser interactivo.
export default function Colapsable({
  titulo,
  contador,
  defaultAbierto = false,
  children,
}: {
  titulo: string;
  contador?: string | number;
  defaultAbierto?: boolean;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(defaultAbierto);

  return (
    <div className="vc-card mb-3">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {titulo}
          {contador !== undefined ? ` (${contador})` : ""}
        </p>
        <span className="shrink-0 text-[11px] text-muted">{abierto ? "Ocultar ▲" : "Ver ▼"}</span>
      </button>
      {abierto && <div className="mt-3">{children}</div>}
    </div>
  );
}
