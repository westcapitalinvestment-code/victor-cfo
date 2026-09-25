import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";

// "Tu resumen del mes" (25 sept 2026, pedido de Joel) — tarjeta pensada
// para darle valor real al plan gratis (sin chat de VICTOR ni banco
// conectado): un vistazo honesto a cómo va el mes, calculado 100% con
// SQL/JS puro (suma y comparación de porcentajes), CERO llamadas a Claude.
// Funciona igual en cualquier plan (gratis, core, pro) porque el cálculo
// no depende de nada exclusivo — solo de las transacciones que el usuario
// ya tiene, sean manuales, importadas por CSV/Excel, o de un banco
// conectado. El dueño de esta tarjeta es app/dashboard/page.tsx, que hace
// las consultas y le pasa los números ya calculados — este componente solo
// los presenta, igual que ResumenCard.
export default function ResumenReglasCard({
  mesLabel,
  gastoMes,
  categoriaTop,
  pctVsMesAnterior,
}: {
  mesLabel: string;
  gastoMes: number;
  categoriaTop: { nombre: string; monto: number } | null;
  pctVsMesAnterior: number | null;
}) {
  const sinGastos = gastoMes === 0;

  return (
    <div className="vc-card !p-0 mb-3">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span aria-hidden style={{ fontSize: 14 }}>
          📊
        </span>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Tu resumen del mes</p>
      </div>

      <div className="p-4">
        {sinGastos ? (
          <p className="text-xs text-muted">
            Todavía no hay gastos registrados en {mesLabel} — en cuanto subas o categorices alguno, aquí vas a ver tu
            categoría #1 y cómo vas comparado con el mes pasado, sin que tengas que calcularlo tú.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-text">
              Llevas{" "}
              <span className="font-medium">
                <Sensitive>{formatMoney(gastoMes)}</Sensitive>
              </span>{" "}
              en gastos de {mesLabel}
              {categoriaTop && (
                <>
                  {" "}
                  — tu categoría con más gasto es <span className="font-medium text-teal">{categoriaTop.nombre}</span>{" "}
                  con{" "}
                  <span className="font-medium">
                    <Sensitive>{formatMoney(categoriaTop.monto)}</Sensitive>
                  </span>
                  .
                </>
              )}
            </p>

            {pctVsMesAnterior !== null && (
              <p className="text-xs text-muted">
                {pctVsMesAnterior > 0 && (
                  <>
                    Vas <span className="font-medium text-red">{pctVsMesAnterior}% más alto</span> que el mes pasado.
                  </>
                )}
                {pctVsMesAnterior < 0 && (
                  <>
                    Vas <span className="font-medium text-grn">{Math.abs(pctVsMesAnterior)}% más bajo</span> que el
                    mes pasado — bien ahí.
                  </>
                )}
                {pctVsMesAnterior === 0 && <>Vas exactamente igual que el mes pasado.</>}
              </p>
            )}

            {pctVsMesAnterior === null && (
              <p className="text-xs text-muted">Todavía no hay gastos del mes pasado con qué comparar.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
