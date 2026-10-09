import type { ResultadoEstimado, Cuota } from "@/lib/impuestos-estimados";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";

// Calendario de las 4 estimadas del año (9 oct 2026, pedido de Joel: ver las 4
// cuotas con su estado, no solo la que falta). Se usa en la tarjeta del dueño
// (con montos ocultables) y en el Portal CPA (sin ocultar).

const ESTADO_UI: Record<Cuota["estado"], { texto: string; color: string }> = {
  pagada: { texto: "Pagada", color: "var(--grn, #1D9E75)" },
  parcial: { texto: "Parcial", color: "#B7860F" },
  vencida: { texto: "Atrasada", color: "var(--red, #D14343)" },
  futura: { texto: "Por pagar", color: "var(--muted, #888)" },
};

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export default function CalendarioEstimadas({
  resultado,
  ocultable = true,
}: {
  resultado: ResultadoEstimado;
  ocultable?: boolean;
}) {
  const Money = ({ v }: { v: number }) => (ocultable ? <Sensitive>{formatMoney(v)}</Sensitive> : <>{formatMoney(v)}</>);
  if (resultado.calendario.length === 0) return null;
  const sobrante = resultado.balance < 0;
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Pagos estimados {resultado.anio}</p>
      <div className="mt-1 flex flex-col">
        {resultado.calendario.map((c) => {
          const ui = ESTADO_UI[c.estado];
          return (
            <div key={c.fecha} className="flex items-start justify-between gap-2 border-b border-border py-1.5 last:border-0">
              <div className="text-xs text-text">
                <p className="font-medium">
                  {fechaCorta(c.fecha)}
                  {c.esProxima && <span className="ml-1.5 rounded bg-surface-2 px-1 py-0.5 text-[9px] uppercase text-muted">próxima</span>}
                </p>
                {c.irs > 0 && c.hacienda > 0 ? (
                  <p className="text-[10px] text-muted">
                    IRS <Money v={c.irs} /> · Hacienda <Money v={c.hacienda} />
                  </p>
                ) : (
                  <p className="text-[10px] text-muted">{c.hacienda > 0 ? "Hacienda de PR" : "IRS"}</p>
                )}
              </div>
              <div className="text-right text-xs">
                <p className="font-medium text-text">
                  <Money v={c.total} />
                </p>
                <p className="text-[10px]" style={{ color: ui.color }}>
                  {ui.texto}
                  {(c.estado === "parcial" || c.estado === "vencida") && c.pendiente > 0 && (
                    <>
                      {" · falta "}
                      <Money v={c.pendiente} />
                    </>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {resultado.atrasado > 0 && (
        <p className="mt-1 text-[11px]" style={{ color: "var(--red, #D14343)" }}>
          Atrasado: <Money v={resultado.atrasado} /> de cuotas ya vencidas — conviene ponerse al día (puede haber recargos).
        </p>
      )}
      <p className="mt-1 text-[10px] text-muted">
        Cada cuota es 1/4 del impuesto proyectado. La diferencia final se salda al presentar la planilla {resultado.anio} (
        {fechaCorta(resultado.fechaPlanilla)}):{" "}
        {sobrante
          ? "si pagaste de más, recibes reintegro o lo aplicas al año siguiente."
          : "se paga cualquier balance que quede; si pagaste de menos antes, ahí se ajusta."}
      </p>
    </div>
  );
}
