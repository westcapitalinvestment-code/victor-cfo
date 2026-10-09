"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sensitive } from "@/lib/privacy";
import CalendarioEstimadas from "./calendario-estimadas";
import { formatMoney } from "@/lib/format";
import type { PerfilImpuestos, ResultadoEstimado } from "@/lib/impuestos-estimados";

// "Impuestos: lo que debes apartar" (8 oct 2026, pedido de Joel) — tarjeta
// del Inicio (Personal y Negocio) que le dice al usuario, ANTES de que
// llegue la época de planillas, cuánto separar de cada ingreso, cuánto sería
// su reintegro/balance y cuánto pagar en la próxima estimada (al IRS y a
// Hacienda). Para cuentapropistas incluye el 15.3% de self-employment.
//
// El cálculo vive en lib/impuestos-estimados.ts (puro) y las consultas en
// lib/impuestos-estimados-server.ts; esta tarjeta solo presenta los números
// y deja editar el perfil (POST /api/impuestos/perfil). Cero llamadas a
// VICTOR/Claude — puro cálculo sobre las transacciones que el usuario ya
// tiene, igual que "Tu resumen del mes".
export default function ImpuestosEstimadosCard({
  resultado,
  perfil,
  perfilGuardado,
  entityId,
  ingresosYTD,
  ingresoMesActual,
  anioDatosFederal,
  anioDatosPR,
}: {
  resultado: ResultadoEstimado;
  perfil: PerfilImpuestos;
  perfilGuardado: boolean;
  entityId: string | null;
  ingresosYTD: number;
  ingresoMesActual: number;
  anioDatosFederal: number;
  anioDatosPR: number;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [residencia, setResidencia] = useState(perfil.residencia);
  const [estatus, setEstatus] = useState(perfil.estatus);
  const [tipo, setTipo] = useState(perfil.tipo);
  const [gastosPct, setGastosPct] = useState(String(perfil.gastosDeduciblesPct || ""));
  const [retenido, setRetenido] = useState(String(perfil.retenidoYTD || ""));
  const [estimadas, setEstimadas] = useState(String(perfil.estimadasPagadasYTD || ""));

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/impuestos/perfil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId,
          residencia,
          estatus,
          tipo,
          gastosDeduciblesPct: Number(gastosPct || 0),
          retenidoYTD: Number(retenido || 0),
          estimadasPagadasYTD: Number(estimadas || 0),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "No se pudo guardar.");
        return;
      }
      setEditando(false);
      router.refresh();
    } catch {
      setError("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  const esEmpleado = perfil.tipo === "empleado";
  const sinIngresos = ingresosYTD <= 0;
  const pctApartar = Math.round(resultado.tasaApartado * 1000) / 10; // 1 decimal
  const reintegro = resultado.balance < 0 ? Math.abs(resultado.balance) : 0;
  const hayAnioViejo = anioDatosFederal < resultado.anio || anioDatosPR < resultado.anio;

  return (
    <div className="vc-card !p-0 mb-3">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden style={{ fontSize: 14 }}>
            🧾
          </span>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Impuestos {resultado.anio}: lo que debes apartar</p>
        </div>
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          className="text-xs font-medium text-teal hover:opacity-80"
        >
          {editando ? "Cerrar" : "Ajustar mis datos"}
        </button>
      </div>

      <div className="p-4">
        {!perfilGuardado && !editando && (
          <p className="mb-2 text-[11px] text-muted">
            Usamos datos típicos (cuenta propia, residente de Puerto Rico). Toca &quot;Ajustar mis datos&quot; para afinar el estimado.
          </p>
        )}

        {sinIngresos ? (
          <p className="text-xs text-muted">
            Todavía no hay ingresos registrados este año. En cuanto entren depósitos (o subas un estado de cuenta), aquí vas a ver cuánto separar para el
            IRS y Hacienda, y cuándo toca pagar cada estimada.
          </p>
        ) : esEmpleado ? (
          <div className="flex flex-col gap-2">
            {resultado.balance < 0 ? (
              <p className="text-sm text-text">
                Reintegro estimado:{" "}
                <span className="font-medium text-grn">
                  <Sensitive>{formatMoney(reintegro)}</Sensitive>
                </span>
              </p>
            ) : (
              <p className="text-sm text-text">
                Podrías tener que pagar{" "}
                <span className="font-medium text-red">
                  <Sensitive>{formatMoney(resultado.balance)}</Sensitive>
                </span>{" "}
                al radicar la planilla.
              </p>
            )}
            <p className="text-xs text-muted">
              Impuesto del año estimado: <Sensitive>{formatMoney(resultado.totalImpuesto)}</Sensitive> · Ya retenido:{" "}
              <Sensitive>{formatMoney(resultado.pagadoYTD)}</Sensitive>
              {resultado.pagadoYTD === 0 && " (ajusta tus datos y agrega lo que te han retenido para afinar el reintegro)"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-text">
              Aparta aproximadamente <span className="font-medium text-teal">{pctApartar}%</span> de cada ingreso para impuestos.
            </p>
            <p className="text-xs text-muted">
              Este mes entraron <Sensitive>{formatMoney(ingresoMesActual)}</Sensitive> → separa{" "}
              <span className="font-medium text-text">
                <Sensitive>{formatMoney(resultado.apartadoMes)}</Sensitive>
              </span>
              . Con lo que ha entrado en el año, a hoy deberías tener apartado{" "}
              <span className="font-medium text-text">
                <Sensitive>{formatMoney(resultado.apartadoYTD)}</Sensitive>
              </span>
              .
            </p>

            <div className="mt-1 rounded-lg border border-border p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Proyección del año</p>
              <div className="mt-1 flex flex-col gap-0.5 text-xs text-text">
                {resultado.totalIRS > 0 && (
                  <p>
                    Al IRS: <Sensitive>{formatMoney(resultado.totalIRS)}</Sensitive>
                    {resultado.seTax > 0 && (
                      <span className="text-muted">
                        {" "}
                        (self-employment 15.3%: <Sensitive>{formatMoney(resultado.seTax)}</Sensitive>
                        {resultado.impuestoFederal > 0 && <> + federal: <Sensitive>{formatMoney(resultado.impuestoFederal)}</Sensitive></>})
                      </span>
                    )}
                  </p>
                )}
                {resultado.totalHacienda > 0 && (
                  <p>
                    A Hacienda de PR: <Sensitive>{formatMoney(resultado.totalHacienda)}</Sensitive>
                  </p>
                )}
                <p className="font-medium">
                  Total estimado: <Sensitive>{formatMoney(resultado.totalImpuesto)}</Sensitive>
                  {resultado.pagadoYTD > 0 && (
                    <span className="font-normal text-muted">
                      {" "}
                      · ya pagado: <Sensitive>{formatMoney(resultado.pagadoYTD)}</Sensitive>
                    </span>
                  )}
                </p>
              </div>
            </div>

            {reintegro > 0 && (
              <p className="text-xs text-grn">
                Con lo que ya pagaste vas por encima del estimado — reintegro aproximado de <Sensitive>{formatMoney(reintegro)}</Sensitive>.
              </p>
            )}

            <CalendarioEstimadas resultado={resultado} />
            {resultado.calendario.length > 0 && (
              <p className="text-[10px] text-muted">
                Anota lo que ya pagaste en &quot;Ajustar mis datos&quot; para que las cuotas se marquen como pagadas.
              </p>
            )}

            {resultado.proyeccionTemprana && (
              <p className="text-[11px] text-amb">Llevas pocos días del año con datos — la proyección mejora con el tiempo.</p>
            )}
          </div>
        )}

        {editando && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border p-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              ¿Dónde resides?
              <select className="vc-input" value={residencia} onChange={(e) => setResidencia(e.target.value as typeof residencia)}>
                <option value="pr">Puerto Rico</option>
                <option value="us">Estados Unidos (continental)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              ¿Cómo generas este ingreso?
              <select className="vc-input" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
                <option value="cuenta_propia">Cuenta propia / contratista / LLC (self-employed)</option>
                <option value="corporacion">Corporación</option>
                <option value="empleado">Empleado (recibo W-2 / nómina)</option>
              </select>
            </label>

            {residencia === "us" && tipo !== "corporacion" && (
              <label className="flex flex-col gap-1 text-xs text-muted">
                Estatus para la planilla
                <select className="vc-input" value={estatus} onChange={(e) => setEstatus(e.target.value as typeof estatus)}>
                  <option value="single">Soltero(a)</option>
                  <option value="mfj">Casado(a) radicando conjunto</option>
                </select>
              </label>
            )}

            {tipo !== "empleado" && (
              <label className="flex flex-col gap-1 text-xs text-muted">
                % de tus ingresos que estimas como gastos deducibles (opcional)
                <input
                  className="vc-input"
                  inputMode="decimal"
                  placeholder="0"
                  value={gastosPct}
                  onChange={(e) => setGastosPct(e.target.value)}
                />
                {entityId && (
                  <span className="text-[10px]">En Negocio ya sumamos tus gastos categorizados; esto se añade encima.</span>
                )}
              </label>
            )}

            <label className="flex flex-col gap-1 text-xs text-muted">
              Impuesto que ya te han retenido este año (talonario / W-2) — opcional
              <input className="vc-input" inputMode="decimal" placeholder="0.00" value={retenido} onChange={(e) => setRetenido(e.target.value)} />
            </label>

            {tipo !== "empleado" && (
              <label className="flex flex-col gap-1 text-xs text-muted">
                Estimadas que ya pagaste este año al IRS y a Hacienda (total) — opcional
                <input className="vc-input" inputMode="decimal" placeholder="0.00" value={estimadas} onChange={(e) => setEstimadas(e.target.value)} />
              </label>
            )}

            {error && <p className="text-xs text-red">{error}</p>}
            <button type="button" className="vc-btn-primary mt-1" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar y recalcular"}
            </button>
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-[11px] font-medium text-muted">¿Cómo se calcula?</summary>
          <ul className="mt-1 list-disc pl-4 text-[11px] text-muted">
            <li>Proyectamos tu ingreso del año al mismo ritmo diario de lo que llevas hasta hoy.</li>
            {resultado.supuestos.map((s) => (
              <li key={s}>{s}</li>
            ))}
            <li>
              Tramos usados: federal {anioDatosFederal}, Puerto Rico {anioDatosPR}.
              {hayAnioViejo && " Aún no hay tramos de este año cargados — se usan los más recientes."}
            </li>
            <li>No incluye exenciones y deducciones personales, créditos, CBA/AMT ni otras reglas de tu caso particular.</li>
          </ul>
        </details>

        <p className="mt-2 text-[11px] text-muted">Esto es un estimado, no asesoría fiscal — confírmalo con tu contador.</p>
      </div>
    </div>
  );
}
