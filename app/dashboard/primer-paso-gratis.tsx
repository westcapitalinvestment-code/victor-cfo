"use client";

// "Tu primer paso" (31 oct 2026). Plan gratis con la cuenta totalmente vacía:
// en vez del cuestionario de 4 preguntas (que se puede ignorar) se muestra UNA
// tarjeta con tres acciones de ~1 minuto. Cada botón abre el panel de registro
// correspondiente (mismo evento que usa "Tu plan"). En cuanto el usuario anota
// algo, la tarjeta desaparece sola y aparece "Tu plan".
type Opcion = { icono: string; titulo: string; detalle: string; panel?: "gasto" | "balance" | "deuda"; href?: string };

const OPCIONES: Opcion[] = [
  { icono: "🧾", titulo: "Anota un gasto de hoy", detalle: "Lo más rápido: 10 segundos y ya ves a dónde se va tu dinero.", panel: "gasto" },
  { icono: "💵", titulo: "Dime cuánto tienes ahora", detalle: "Tu balance de partida; todo lo que anotes lo suma o lo resta.", panel: "balance" },
  { icono: "📄", titulo: "Sube tu estado de cuenta", detalle: "Sube el PDF de tu banco y VICTOR lo lee por ti.", href: "/dashboard/cuentas" },
];

function abrir(panel: "gasto" | "balance" | "deuda") {
  window.dispatchEvent(new CustomEvent("vc-abrir-panel", { detail: { panel } }));
}

export default function PrimerPasoGratis({ nombre }: { nombre?: string | null }) {
  return (
    <div className="mb-3 rounded-xl p-4" style={{ background: "rgba(20,184,166,0.10)", border: "1px solid #14b8a6" }}>
      <p className="text-sm font-medium">👋 {nombre ? `${nombre}, empieza` : "Empieza"} con un solo paso</p>
      <p className="mt-0.5 text-[11px] text-muted">Elige uno. Toma menos de un minuto y tu Inicio empieza a llenarse.</p>
      <div className="mt-3 flex flex-col gap-2">
        {OPCIONES.map((o) => {
          const cuerpo = (
            <>
              <span aria-hidden className="text-lg">
                {o.icono}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{o.titulo}</span>
                <span className="block text-[11px] text-muted">{o.detalle}</span>
              </span>
              <span className="text-teal">→</span>
            </>
          );
          const cls = "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left hover:border-teal";
          return o.href ? (
            <a key={o.titulo} href={o.href} className={cls}>
              {cuerpo}
            </a>
          ) : (
            <button key={o.titulo} type="button" className={cls} onClick={() => abrir(o.panel!)}>
              {cuerpo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
