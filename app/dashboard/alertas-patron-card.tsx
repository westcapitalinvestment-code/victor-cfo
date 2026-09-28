// "Alertas inteligentes" (28 sept 2026, pedido de Joel: "alertas de patron
// y alertas de salud financiera", como seguimiento a "Tu resumen del mes"
// — mismo espíritu: cero llamadas a VICTOR/Claude, puro SQL/JS sobre las
// transacciones y metas que el usuario ya tiene. Vive debajo de
// ResumenReglasCard en app/dashboard/page.tsx, que hace todo el cálculo y
// le pasa a este componente la lista ya armada — este solo la presenta.
//
// Dos categorías de alerta (mismo color/ícono para que el usuario
// distinga de un vistazo):
// - "patron": algo inusual en el GASTO (categoría que subió, comercio
//   nuevo, cargo recurrente que subió de precio).
// - "salud": algo sobre la SALUD financiera general (déficit del mes,
//   meta de ahorro estancada).
export type AlertaRegla = {
  tipo: "patron" | "salud";
  icono: string;
  texto: string;
};

export default function AlertasPatronCard({ alertas }: { alertas: AlertaRegla[] }) {
  return (
    <div className="vc-card !p-0 mb-3">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span aria-hidden style={{ fontSize: 14 }}>
          🔎
        </span>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Alertas inteligentes</p>
      </div>

      <div className="p-4">
        {alertas.length === 0 ? (
          <p className="text-xs text-muted">
            Todo se ve normal este mes — sin subidas raras, sin déficit, sin metas estancadas.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {alertas.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <span aria-hidden style={{ fontSize: 14, lineHeight: "18px" }}>
                  {a.icono}
                </span>
                <p className="text-xs text-text">{a.texto}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
