import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";
import type { ResultadoRegla, Grupo } from "@/lib/regla-50-30-20";

// "Regla 50/30/20" (22 oct 2026) — regalo del plan gratis: reparte el mes en
// Necesidades / Gustos / Ahorro y deudas y lo compara con 50/30/20 del
// ingreso. Cálculo en lib/regla-50-30-20.ts (cero IA). Solo se monta para
// plan='gratis': el resto de planes le pregunta a VICTOR.
const NOMBRE: Record<Grupo, string> = {
  necesidades: "Necesidades",
  gustos: "Gustos",
  ahorro: "Ahorro y deudas",
};
const AYUDA: Record<Grupo, string> = {
  necesidades: "vivienda, comida, luz, transporte, salud, seguros",
  gustos: "restaurantes, entretenimiento, ropa, regalos y otros",
  ahorro: "ahorro, inversión y pagos de deudas",
};

export default function Regla503020Card({ mesLabel, resultado }: { mesLabel: string; resultado: ResultadoRegla }) {
  const sinIngresos = resultado.ingresos <= 0;
  return (
    <div className="vc-card !p-0 mb-3">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span aria-hidden style={{ fontSize: 14 }}>
          🥧
        </span>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Regla 50/30/20 · {mesLabel}</p>
      </div>
      <div className="p-4">
        {sinIngresos ? (
          <p className="text-xs text-muted">
            Para repartir tu mes en 50/30/20 necesito saber cuánto entró. Registra o importa tus ingresos de {mesLabel} y
            aquí verás cuánto va a necesidades, gustos y ahorro.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted">
              Ingresos del mes: <span className="font-medium text-text"><Sensitive>{formatMoney(resultado.ingresos)}</Sensitive></span>
            </p>
            {resultado.filas.map((f) => {
              const ancho = Math.min(100, f.pct);
              const ok = f.estado === "bien";
              return (
                <div key={f.grupo}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{NOMBRE[f.grupo]}</span>
                    <span className={ok ? "text-grn" : "text-red"}>
                      {f.pct}% <span className="text-[11px] text-muted">/ meta {f.meta}%</span>
                    </span>
                  </div>
                  <div className="vc-bar mt-1">
                    <div className="vc-bar-fill" style={{ width: `${ancho}%`, background: ok ? undefined : "var(--red, #c0392b)" }} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    <Sensitive>{formatMoney(f.monto)}</Sensitive> · {AYUDA[f.grupo]}
                    {!ok && f.grupo !== "ahorro" && " · te pasaste de la meta"}
                    {!ok && f.grupo === "ahorro" && " · por debajo de la meta"}
                  </p>
                </div>
              );
            })}
            {resultado.sinClasificar > 0 && (
              <p className="text-[11px] text-muted">
                <Sensitive>{formatMoney(resultado.sinClasificar)}</Sensitive> sin categoría clara se cuentan en Gustos.
                Categoriza tus gastos para que el reparto sea más exacto.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
