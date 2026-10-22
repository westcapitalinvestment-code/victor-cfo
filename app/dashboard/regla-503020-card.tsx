import Link from "next/link";
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
  ahorro: "págate primero: lo que aportas a ahorro, inversión y pagos de deudas",
};

export default function Regla503020Card({ mesLabel, resultado }: { mesLabel: string; resultado: ResultadoRegla }) {
  const sinIngresos = resultado.ingresos <= 0;
  return (
    <div id="regla-50-30-20" className="vc-card !p-0 mb-3">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span aria-hidden style={{ fontSize: 14 }}>
          🥧
        </span>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Regla 50/30/20 · {mesLabel}</p>
      </div>
      <div className="p-4">
        {sinIngresos ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">
              Para repartir tu mes en 50/30/20 necesito saber cuánto entró. Anota tus ingresos de {mesLabel} (sueldo, efectivo,
              lo que sea) o sube el estado de cuenta de tu banco, y aquí verás cuánto va a necesidades, gustos y ahorro.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/gastos?anadir=ingreso" className="vc-btn-primary !w-auto px-4 !py-1.5 !text-xs">
                + Anotar un ingreso
              </Link>
              <Link
                href="/dashboard/cuentas"
                className="flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:opacity-80"
              >
                Subir estado de cuenta
              </Link>
            </div>
          </div>
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
                    {!ok && f.grupo === "necesidades" && " · por encima de la guía; es común, ve bajándolo poco a poco"}
                    {!ok && f.grupo === "gustos" && " · un poco por encima de la guía"}
                    {!ok && f.grupo === "ahorro" && (f.pct < 10 ? " · empieza con 10% y sube hacia 20%" : " · vas bien, sube hacia 20%")}
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
