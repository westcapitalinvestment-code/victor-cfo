// Alertas Inteligentes del Portal CPA, agrupadas por tipo de vencimiento
// real (4 oct 2026, pedido de Joel a nombre de su esposa: "si las alertas se
// pudieran categorizar por alertar reales ej: 480.9A día 15, IVU día 20 o
// las que sean que usen los contables") — antes cada alerta era una línea
// suelta sin agrupar (y en app/cpa/page.tsx ni siquiera se mostraban, solo
// se usaban para contar un badge por cliente). Ahora se agrupan bajo un
// encabezado por tipo ("480.9A — vence día 15", "IVU", etc.) para que un
// contable con muchos clientes vea de un vistazo CUÁNTOS clientes tienen
// cada tipo de pendiente, en vez de escanear una lista plana.
//
// Componente puro (sin "use client", sin hooks) para poder usarse tal cual
// dentro de los Server Components app/cpa/page.tsx (portafolio) y
// app/cpa/[entityId]/page.tsx (por cliente) — mismo componente, una sola
// fuente de verdad para el estilo.
export type AlertaCpa = {
  tono: "red" | "amb";
  icono: string;
  texto: string;
  // Identificador estable del tipo de alerta (ej. "ivu_vencido",
  // "retencion_480"), usado solo para agrupar — no se muestra.
  tipo: string;
  // Encabezado legible del grupo (ej. "IVU vencido", "480.9A — vence día
  // 15") — todas las alertas del mismo `tipo` deben traer el mismo texto.
  tipoLabel: string;
};

export default function AlertasAgrupadas({ alertas, emptyText }: { alertas: AlertaCpa[]; emptyText: string }) {
  if (alertas.length === 0) {
    return <p className="text-sm text-muted">{emptyText}</p>;
  }

  // Agrupar preservando el orden de primera aparición; un grupo "sube" a
  // rojo si CUALQUIERA de sus alertas es roja, para que lo más urgente
  // siempre quede arriba.
  const grupos = new Map<string, { tipoLabel: string; tono: "red" | "amb"; alertas: AlertaCpa[] }>();
  for (const a of alertas) {
    const g = grupos.get(a.tipo);
    if (g) {
      g.alertas.push(a);
      if (a.tono === "red") g.tono = "red";
    } else {
      grupos.set(a.tipo, { tipoLabel: a.tipoLabel, tono: a.tono, alertas: [a] });
    }
  }
  const listaGrupos = Array.from(grupos.values()).sort((a, b) => (a.tono === b.tono ? 0 : a.tono === "red" ? -1 : 1));

  return (
    <div className="flex flex-col gap-4">
      {listaGrupos.map((g) => (
        <div key={g.tipoLabel}>
          <p
            className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
              g.tono === "red" ? "text-red" : "text-amb"
            }`}
          >
            <i className={`ti ${g.alertas[0].icono}`} />
            {g.tipoLabel} ({g.alertas.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {g.alertas.map((a, i) => (
              <li key={i} className="flex items-start gap-2 pl-1 text-sm">
                <span className={`mt-[7px] h-1 w-1 flex-shrink-0 rounded-full ${a.tono === "red" ? "bg-red" : "bg-amb"}`} />
                <span>{a.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
