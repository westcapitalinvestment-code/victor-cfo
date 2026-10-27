import { MESES_CORTOS, type EstadoResultados } from "@/lib/estado-resultados";
import { formatMoney } from "@/lib/format";

// Tabla del Estado de Resultados (matriz categoría × mes) para el Portal CPA
// — misma presentación que /dashboard/negocio/estado-resultados (secciones
// Ingresos/Gastos con tinte propio, totales y utilidad neta). 10 oct 2026,
// pedido de Joel: "la parte de reporte ponla así también, que se vea
// organizado" (para la sección Personal).
const TEAL = "#0f6b4e";
const ROJO = "#d44c3d";
const TINTE_INGRESOS = "rgba(15, 107, 78, 0.06)";
const TINTE_GASTOS = "rgba(212, 76, 61, 0.06)";

type Linea = { nombre: string; lineaScheduleC: string | null; porMes: number[]; total: number };

function FilaLinea({ l, color, tinte }: { l: Linea; color: string; tinte: string }) {
  return (
    <tr className="border-b" style={{ borderColor: "var(--border)", background: tinte }}>
      <td className="sticky left-0 whitespace-nowrap px-3 py-2 text-sm" style={{ background: tinte }}>
        <div>{l.nombre}</div>
        {l.lineaScheduleC && <div className="text-xs text-muted">{l.lineaScheduleC}</div>}
      </td>
      {l.porMes.map((v, i) => (
        <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-sm" style={{ color: v ? undefined : "var(--muted)" }}>
          {v ? formatMoney(v, 0) : "—"}
        </td>
      ))}
      <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-medium" style={{ color }}>
        {formatMoney(l.total, 0)}
      </td>
    </tr>
  );
}

function FilaTotal({ label, porMes, total, color, tinte }: { label: string; porMes: number[]; total: number; color: string; tinte: string }) {
  return (
    <tr className="border-b-2 border-t-2" style={{ borderColor: color }}>
      <td className="sticky left-0 whitespace-nowrap px-3 py-2 text-sm font-semibold" style={{ background: tinte, color }}>
        {label}
      </td>
      {porMes.map((v, i) => (
        <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold" style={{ background: tinte, color }}>
          {formatMoney(v, 0)}
        </td>
      ))}
      <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-bold" style={{ background: tinte, color }}>
        {formatMoney(total, 0)}
      </td>
    </tr>
  );
}

function FilaSeccion({ label, color }: { label: string; color: string }) {
  return (
    <tr>
      <td colSpan={14} className="px-3 py-2 text-xs font-bold uppercase tracking-wide" style={{ background: color, color: "white" }}>
        {label}
      </td>
    </tr>
  );
}

const Separador = () => (
  <tr style={{ height: "10px" }}>
    <td colSpan={14} />
  </tr>
);

export default function EstadoResultadosTabla({ er, anio }: { er: EstadoResultados; anio: number }) {
  return (
    <div className="vc-card overflow-x-auto !p-0">
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ background: "#0f6b4e" }}>
            <th className="sticky left-0 whitespace-nowrap px-3 py-2 text-left text-sm font-semibold text-white" style={{ background: "#0f6b4e" }}>
              Categoría
            </th>
            {MESES_CORTOS.map((m) => (
              <th key={m} className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold text-white">
                {m}
              </th>
            ))}
            <th className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold text-white">Total</th>
          </tr>
        </thead>
        <tbody>
          <FilaSeccion label="Ingresos" color={TEAL} />
          {er.ingresos.length === 0 && (
            <tr style={{ background: TINTE_INGRESOS }}>
              <td colSpan={14} className="px-3 py-2 text-sm text-muted">
                Sin ingresos categorizados en {anio}.
              </td>
            </tr>
          )}
          {er.ingresos.map((l) => (
            <FilaLinea key={l.nombre} l={l} color={TEAL} tinte={TINTE_INGRESOS} />
          ))}
          <FilaTotal label="Total ingresos" porMes={er.totalIngresosPorMes} total={er.totalIngresos} color={TEAL} tinte={TINTE_INGRESOS} />
          <Separador />
          <FilaSeccion label="Gastos" color={ROJO} />
          {er.gastos.length === 0 && (
            <tr style={{ background: TINTE_GASTOS }}>
              <td colSpan={14} className="px-3 py-2 text-sm text-muted">
                Sin gastos categorizados en {anio}.
              </td>
            </tr>
          )}
          {er.gastos.map((l) => (
            <FilaLinea key={l.nombre} l={l} color={ROJO} tinte={TINTE_GASTOS} />
          ))}
          <FilaTotal label="Total gastos" porMes={er.totalGastosPorMes} total={er.totalGastos} color={ROJO} tinte={TINTE_GASTOS} />
          <Separador />
          <FilaTotal
            label="Utilidad neta"
            porMes={er.utilidadPorMes}
            total={er.utilidadNeta}
            color={er.utilidadNeta >= 0 ? TEAL : ROJO}
            tinte="transparent"
          />
        </tbody>
      </table>
    </div>
  );
}
