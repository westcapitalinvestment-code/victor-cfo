import type { EstimadoImpuestosCompleto } from "@/lib/impuestos-estimados-server";
import CalendarioEstimadas from "@/app/dashboard/calendario-estimadas";
import { formatMoney } from "@/lib/format";

// Impuestos estimados del cliente, para el contable (9 oct 2026, pedido de
// Joel: "que el contable sepa lo que el cliente adeuda y tiene que pagar para
// que él pase menos trabajo... solo llamar al cliente o enviarle un mail
// confirmando la cantidad"). Mismo cálculo que ve el dueño en su Inicio.
export default function ImpuestosCliente({
  entidadNombre,
  clienteEmail,
  estimado,
}: {
  entidadNombre: string;
  clienteEmail: string | null;
  estimado: EstimadoImpuestosCompleto;
}) {
  const { resultado: r, perfil, perfilGuardado } = estimado;
  const tipoLabel =
    perfil.tipo === "corporacion" ? "Corporación" : perfil.tipo === "empleado" ? "Empleado" : "Cuenta propia / LLC";
  const montoRef = r.proxima ? r.proxima.pendiente || r.proxima.total : 0;

  const asunto = `Contribución estimada ${r.anio} — ${entidadNombre}`;
  const lineas = [
    `Hola,`,
    ``,
    `Según lo que va el año en VICTOR CFO, el estimado de impuestos ${r.anio} de ${entidadNombre} es ${formatMoney(r.totalImpuesto)}` +
      ` (IRS ${formatMoney(r.totalIRS)}${r.totalHacienda > 0 ? `, Hacienda ${formatMoney(r.totalHacienda)}` : ""}).`,
    r.proxima
      ? `La próxima cuota es el ${r.proxima.fecha}: aprox. ${formatMoney(montoRef)} (IRS ${formatMoney(r.proxima.irs)}, Hacienda ${formatMoney(r.proxima.hacienda)}).`
      : "",
    r.atrasado > 0 ? `Hay cuotas anteriores sin cubrir por ${formatMoney(r.atrasado)}.` : "",
    r.pagadoYTD > 0 ? `Pagado hasta ahora: ${formatMoney(r.pagadoYTD)}.` : "",
    ``,
    `¿Me confirmas si estos números te cuadran y cuánto llevas pagado?`,
    ``,
    `Gracias.`,
  ].filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
  const mailto = clienteEmail
    ? `mailto:${encodeURIComponent(clienteEmail)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(lineas.join("\n"))}`
    : null;

  const Fila = ({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) => (
    <div className={`flex justify-between border-b border-border py-1.5 text-sm ${fuerte ? "font-medium" : ""}`}>
      <span className="text-muted">{k}</span>
      <span>{v}</span>
    </div>
  );

  return (
    <div className="vc-card mb-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Impuestos estimados {r.anio}</p>
          <p className="text-[11px] text-muted">
            {tipoLabel} · {perfil.residencia === "pr" ? "Reside en PR" : "Reside en EE.UU."}
            {perfilGuardado ? "" : " · datos por defecto (el cliente aún no los ha ajustado)"}
          </p>
        </div>
        {mailto && (
          <a href={mailto} className="vc-btn-primary !px-3 !py-1.5 text-xs">
            <i className="ti ti-mail mr-1" /> Confirmar con el cliente
          </a>
        )}
      </div>

      <div className="mb-3">
        <Fila k="Ingresos del año a la fecha" v={formatMoney(estimado.ingresosYTD)} />
        <Fila k="Ingreso bruto proyectado (fin de año)" v={formatMoney(r.ingresoBrutoProyectado)} />
        <Fila k="Ganancia neta proyectada" v={formatMoney(r.netoProyectado)} />
        {r.seTax > 0 && <Fila k="Self-employment 15.3% (IRS)" v={formatMoney(r.seTax)} />}
        {r.impuestoFederal > 0 && <Fila k="Impuesto federal sobre ingresos" v={formatMoney(r.impuestoFederal)} />}
        {r.impuestoPR > 0 && <Fila k="Impuesto Hacienda PR" v={formatMoney(r.impuestoPR)} />}
        <Fila k="Total al IRS" v={formatMoney(r.totalIRS)} />
        <Fila k="Total a Hacienda" v={formatMoney(r.totalHacienda)} />
        <Fila k="Total estimado" v={formatMoney(r.totalImpuesto)} fuerte />
        <Fila k="Pagado / retenido (según el cliente)" v={formatMoney(r.pagadoYTD)} />
        <Fila
          k={r.balance < 0 ? "Reintegro estimado al presentar" : "Balance estimado a pagar"}
          v={formatMoney(Math.abs(r.balance))}
          fuerte
        />
        {r.tasaApartado > 0 && <Fila k="% que debe apartar de cada ingreso" v={`${Math.round(r.tasaApartado * 1000) / 10}%`} />}
      </div>

      <CalendarioEstimadas resultado={r} ocultable={false} />

      <p className="mt-2 text-[10px] text-muted">
        Estimado automático con tramos {estimado.anioDatosFederal} (federal) / {estimado.anioDatosPR} (PR), proyectando el ritmo del año a la
        fecha. No incluye exenciones/deducciones personales de PR, créditos, CBA/AMT ni impuesto estatal. Los pagos hechos los anota el cliente
        — confírmalos con él.
      </p>
    </div>
  );
}
