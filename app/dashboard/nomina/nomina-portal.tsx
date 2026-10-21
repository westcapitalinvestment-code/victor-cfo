"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatFecha, formatMoney } from "@/lib/format";
import ImportarHoras from "./importar-horas";
import LicenciasTab from "./licencias-tab";
import { LicenciasEnCorrida } from "./licencias-extra";
import ReportesTab from "./reportes-tab";
import BonoNavidad from "./bono-navidad";

// Portal de Nómina (19 oct 2026). Cuatro pestañas: Corrida (calcular y guardar),
// Empleados, Historial y Tasas. Todos los números los calcula el servidor
// (lib/nomina.ts); aquí solo se piden y se muestran.

export interface ParamFila {
  jurisdiccion: string;
  clave: string;
  valor: number;
  descripcion: string | null;
  fuente: string | null;
  por_confirmar: boolean;
}

type Frecuencia = "semanal" | "bisemanal" | "quincenal" | "mensual";
type TabId = "corrida" | "empleados" | "historial" | "tasas" | "licencias" | "reportes" | "auditoria";

interface Empleado {
  id: string;
  nombre: string;
  ssn_ultimos4: string | null;
  email: string | null;
  frecuencia: Frecuencia;
  tipo_pago: "salario" | "hora";
  tarifa: number;
  estado_civil: "soltero" | "casado_conjunto" | "casado_separado";
  exencion_personal: "completa" | "compartida" | "ninguna";
  dependientes: number;
  allowances_deduccion: number;
  veterano: boolean;
  deduccion_especial: boolean;
  retencion_adicional: number;
  deduccion_medico: number;
  aporte_401k: number;
  es_chofer: boolean;
  exento_sinot?: boolean;
  joven_exento?: boolean;
  fecha_nacimiento?: string | null;
  ytd_inicial: { bruto?: number; sinot_base?: number; suta_base?: number; futa_base?: number } | null;
  ytd_inicial_anio: number | null;
  activo: boolean;
}

interface LineaCalc {
  employeeId: string;
  nombre: string;
  bruto: number;
  desglose: { regular: number; extra: number; comisiones: number; bonos: number; otros: number };
  ssEmp: number;
  medicareEmp: number;
  medicareAdic: number;
  hacienda: number;
  sinotEmp: number;
  choferil: number;
  deduccionMedico: number;
  aporte401k: number;
  otrasDeducciones: number;
  neto: number;
  ssPat: number;
  medicarePat: number;
  futa: number;
  suta: number;
  sinotPat: number;
  cfse: number;
  advertencias: string[];
}

interface LineaAsiento {
  cuenta: string;
  debito: number;
  credito: number;
  nota?: string;
}

interface Resumen {
  totales: {
    bruto: number;
    neto: number;
    retencionesEmpleado: number;
    deduccionesVoluntarias: number;
    contribucionesPatronales: number;
    costoTotalPatrono: number;
  };
  depositos: { irs941: number; hacienda499R1B: number; dtrh: number; futa: number; provisionCfse: number };
  asiento: LineaAsiento[];
  advertencias: string[];
}

interface Resultado {
  anio: number;
  lineas: LineaCalc[];
  resumen: Resumen;
  vencimiento: { trimestre: string; vence: string };
  porConfirmar: string[];
  asientoCuadra: boolean;
}

interface Corrida {
  id: string;
  anio: number;
  frecuencia: Frecuencia;
  periodo_inicio: string;
  periodo_fin: string;
  fecha_pago: string;
  totales: Resumen["totales"];
  depositos: Resumen["depositos"] & { trimestre?: string; vence?: string };
  estado?: string; // 'aprobada' | 'pendiente' (la dejó el contable y espera al dueño)
  creada_por?: string | null;
  creada_por_rol?: string | null;
  aprobada_por?: string | null;
}

interface Edicion {
  id: string;
  frecuencia: Frecuencia;
  inicio: string;
  fin: string;
  fechaPago: string;
  entradas: Record<string, EntradaUI>;
}

interface Config {
  suta_tasa: number | null;
  cfse_tasa: number | null;
  cfse_poliza: string | null;
  cfse_codigo_riesgo: string | null;
  futa_aplica: boolean;
  cpa_puede_nomina?: boolean;
  cpa_aprueba_directo?: boolean;
  bono_activo?: boolean | null;
  bono_pct?: number | null;
  bono_tope?: number | null;
  bono_horas_min?: number | null;
  bono_inicio?: string | null;
  bono_fin?: string | null;
  bono_fecha_pago?: string | null;
  vac_dias_mes?: number | null;
  vac_meses_espera?: number | null;
  vac_tope?: number | null;
  enf_dias_mes?: number | null;
  enf_meses_espera?: number | null;
  enf_tope?: number | null;
  horas_por_dia?: number | null;
}

const FREC_LABEL: Record<Frecuencia, string> = {
  semanal: "Semanal",
  bisemanal: "Bisemanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

function Campo({ label, children, ayuda }: { label: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {ayuda && <span className="mt-0.5 block text-[11px] text-muted">{ayuda}</span>}
    </label>
  );
}

function descargarCsv(nombre: string, filas: (string | number)[][]) {
  const csv = filas
    .map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function csvAsiento(asiento: LineaAsiento[], etiqueta: string) {
  descargarCsv(`asiento-nomina-${etiqueta}.csv`, [
    ["Cuenta", "Débito", "Crédito", "Nota"],
    ...asiento.map((l) => [l.cuenta, l.debito.toFixed(2), l.credito.toFixed(2), l.nota ?? ""]),
  ]);
}

export default function NominaPortal({
  entidades,
  entidadInicialId,
  parametros,
  anio,
  modoContable = false,
}: {
  entidades: { id: string; name: string }[];
  entidadInicialId: string;
  parametros: ParamFila[];
  anio: number;
  modoContable?: boolean; // true = lo usa el contable desde su portal (con permiso del dueño)
}) {
  const [entityId, setEntityId] = useState(entidadInicialId);
  const [tab, setTab] = useState<TabId>("corrida");
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [corridas, setCorridas] = useState<Corrida[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);

  // Corregir una corrida guardada: carga sus entradas y abre el formulario de Corrida en modo edición.
  async function editarCorrida(id: string) {
    setError(null);
    const j = await fetch(`/api/nomina/corridas/${id}`).then((r) => r.json()).catch(() => null);
    if (!j?.ok) {
      setError(j?.error ?? "No se pudo abrir la corrida.");
      return;
    }
    const entradas: Record<string, EntradaUI> = {};
    for (const l of j.lineas as { employee_id: string; entrada: Record<string, number> }[]) {
      const e = l.entrada ?? {};
      const t = (v: unknown) => (Number(v) ? String(v) : "");
      entradas[l.employee_id] = {
        incluir: true,
        horasRegulares: t(e.horasRegulares),
        horasExtra: t(e.horasExtra),
        comisiones: t(e.comisiones),
        bonos: t(e.bonos),
        otrasDeducciones: t(e.otrasDeducciones),
      };
    }
    setEdicion({
      id,
      frecuencia: j.corrida.frecuencia,
      inicio: String(j.corrida.periodo_inicio).slice(0, 10),
      fin: String(j.corrida.periodo_fin).slice(0, 10),
      fechaPago: String(j.corrida.fecha_pago).slice(0, 10),
      entradas,
    });
    setAviso(null);
    setTab("corrida");
  }

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [a, b, c] = await Promise.all([
        fetch(`/api/nomina/empleados?entityId=${entityId}`).then((r) => r.json()),
        fetch(`/api/nomina/corridas?entityId=${entityId}`).then((r) => r.json()),
        fetch(`/api/nomina/config?entityId=${entityId}`).then((r) => r.json()),
      ]);
      if (a.error) throw new Error(a.error);
      setEmpleados(a.empleados ?? []);
      setCorridas(b.corridas ?? []);
      setConfig(c.config ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la nómina.");
    }
    setCargando(false);
  }, [entityId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const porConfirmar = parametros.filter((p) => p.por_confirmar);
  // El contable sin "aprobación directa" deja la corrida pendiente de la autorización del dueño.
  const enviaAAprobacion = modoContable && !config?.cpa_aprueba_directo;

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: "corrida", label: "Corrida", icon: "ti-calculator" },
    { id: "empleados", label: "Empleados", icon: "ti-users" },
    { id: "historial", label: "Historial", icon: "ti-history" },
    { id: "tasas", label: "Tasas", icon: "ti-percentage" },
    { id: "licencias", label: "Licencias", icon: "ti-beach" },
    { id: "reportes", label: "Reportes", icon: "ti-file-analytics" },
    { id: "auditoria", label: "Auditoría", icon: "ti-shield-check" },
  ];

  return (
    <div className="vc-shell">
      {!modoContable && (
        <div className="mb-4 flex items-center justify-between">
          <Link href="/dashboard" className="vc-btn-back">
            ← Atrás
          </Link>
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-teal bg-teal/[.04] p-3.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-lg font-medium">Nómina</p>
            <p className="text-xs text-muted">
              {modoContable ? "Puerto Rico · lo estás operando como contable de este cliente" : "Puerto Rico · VICTOR calcula, tú radicas y depositas"}
            </p>
          </div>
          {entidades.length > 1 && (
            <select className="vc-input w-full sm:w-auto sm:min-w-[260px] sm:max-w-[360px]" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {entidades.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-col" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 4, gap: 3 }}>
          {[TABS.slice(0, 4), TABS.slice(4)].map((fila, i) => (
            <div key={i} className="flex" style={{ gap: 3 }}>
              {fila.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="flex flex-1 flex-col items-center gap-0.5"
                  style={{
                    padding: "9px 4px",
                    fontSize: 11,
                    fontWeight: 500,
                    color: tab === t.id ? "#1D9E75" : "var(--muted)",
                    borderBottom: tab === t.id ? "2px solid #1D9E75" : "2px solid transparent",
                    background: "none",
                  }}
                >
                  <i className={`ti ${t.icon}`} style={{ fontSize: 17 }} />
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {porConfirmar.length > 0 && (
        <div className="mb-3 rounded-lg border border-amb bg-amb/[.08] px-3 py-2 text-xs">
          <strong>{porConfirmar.length} tasas/reglas están marcadas «por confirmar»</strong> con tu contable (ver pestaña
          Tasas). Los números son un estimado hasta que se validen.
        </div>
      )}
      {error && <p className="mb-3 text-xs text-red">{error}</p>}
      {aviso && <p className="mb-3 text-xs text-teal">{aviso}</p>}

      {cargando ? (
        <p className="text-sm text-muted">Cargando...</p>
      ) : (
        <>
          {tab === "corrida" && (
            <CorridaTab
              entityId={entityId}
              empleados={empleados.filter((e) => e.activo || (edicion && edicion.entradas[e.id]))}
              enviaAAprobacion={enviaAAprobacion}
              edicion={edicion}
              onCancelarEdicion={() => setEdicion(null)}
              onGuardada={() => {
                const editada = !!edicion;
                setEdicion(null);
                setAviso(
                  editada
                    ? "Corrida corregida. Los números ya están actualizados."
                    : enviaAAprobacion
                    ? "Corrida enviada. Queda pendiente hasta que el dueño la autorice; todavía no cuenta para los acumulados."
                    : "Corrida guardada. Ya cuenta para los acumulados del año."
                );
                recargar();
                setTab("historial");
              }}
              onIrEmpleados={() => setTab("empleados")}
            />
          )}
          {tab === "empleados" && <EmpleadosTab entityId={entityId} empleados={empleados} anio={anio} onCambio={recargar} />}
          {tab === "historial" && <HistorialTab entityId={entityId} corridas={corridas} modoContable={modoContable} apruebaDirecto={!!config?.cpa_aprueba_directo} onCambio={recargar} onEditar={editarCorrida} />}
          {tab === "licencias" && <LicenciasTab entityId={entityId} />}
          {tab === "reportes" && <ReportesTab entityId={entityId} />}
          {tab === "auditoria" && <AuditoriaTab entityId={entityId} />}
          {tab === "tasas" && <TasasTab entityId={entityId} config={config} parametros={parametros} anio={anio} modoContable={modoContable} onGuardado={recargar} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Corrida
// ---------------------------------------------------------------------------
interface EntradaUI {
  incluir: boolean;
  horasRegulares: string;
  horasExtra: string;
  comisiones: string;
  bonos: string;
  otrasDeducciones: string;
}

function CorridaTab({
  entityId,
  empleados,
  onGuardada,
  onIrEmpleados,
  enviaAAprobacion = false,
  edicion = null,
  onCancelarEdicion,
}: {
  entityId: string;
  empleados: Empleado[];
  onGuardada: () => void;
  onIrEmpleados: () => void;
  enviaAAprobacion?: boolean;
  edicion?: Edicion | null;
  onCancelarEdicion?: () => void;
}) {
  const [frecuencia, setFrecuencia] = useState<Frecuencia>("quincenal");
  const [inicio, setInicio] = useState(hoyISO());
  const [fin, setFin] = useState(hoyISO());
  const [fechaPago, setFechaPago] = useState(hoyISO());
  const [entradas, setEntradas] = useState<Record<string, EntradaUI>>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al entrar en modo edición se cargan las entradas de la corrida guardada.
  useEffect(() => {
    if (!edicion) return;
    setFrecuencia(edicion.frecuencia);
    setInicio(edicion.inicio);
    setFin(edicion.fin);
    setFechaPago(edicion.fechaPago);
    setEntradas(edicion.entradas);
    setResultado(null);
  }, [edicion]);

  const delPeriodo = useMemo(() => empleados.filter((e) => e.frecuencia === frecuencia), [empleados, frecuencia]);

  const entrada = (id: string): EntradaUI =>
    entradas[id] ?? { incluir: true, horasRegulares: "", horasExtra: "", comisiones: "", bonos: "", otrasDeducciones: "" };
  const cambiar = (id: string, parcial: Partial<EntradaUI>) => {
    setResultado(null);
    setEntradas((p) => ({ ...p, [id]: { ...entrada(id), ...parcial } }));
  };

  function cuerpo() {
    return {
      entityId,
      runId: edicion?.id,
      frecuencia,
      periodoInicio: inicio,
      periodoFin: fin,
      fechaPago,
      lineas: delPeriodo
        .filter((e) => entrada(e.id).incluir)
        .map((e) => {
          const x = entrada(e.id);
          return {
            employeeId: e.id,
            horasRegulares: Number(x.horasRegulares) || 0,
            horasExtra: Number(x.horasExtra) || 0,
            comisiones: Number(x.comisiones) || 0,
            bonos: Number(x.bonos) || 0,
            otrasDeducciones: Number(x.otrasDeducciones) || 0,
          };
        }),
    };
  }

  async function calcular() {
    setTrabajando(true);
    setError(null);
    const r = await fetch("/api/nomina/calcular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo()),
    });
    const j = await r.json().catch(() => null);
    setTrabajando(false);
    if (!r.ok) {
      setResultado(null);
      setError(j?.error ?? "No se pudo calcular.");
      return;
    }
    setResultado(j as Resultado);
  }

  async function guardar() {
    const msg = edicion
      ? "¿Guardar los cambios de esta corrida? Se recalcula y reemplaza la anterior. Las corridas posteriores del año no se recalculan."
      : enviaAAprobacion
      ? "¿Enviar esta corrida al dueño? Queda pendiente de su autorización y todavía no cuenta para los acumulados."
      : "¿Guardar esta corrida? Cuenta para los acumulados del año (topes de Seguro Social, SUTA, etc.).";
    if (!window.confirm(msg)) return;
    setTrabajando(true);
    setError(null);
    const r = await fetch(edicion ? `/api/nomina/corridas/${edicion.id}` : "/api/nomina/corridas", {
      method: edicion ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo()),
    });
    const j = await r.json().catch(() => null);
    setTrabajando(false);
    if (!r.ok) {
      setError(j?.error ?? "No se pudo guardar.");
      return;
    }
    setResultado(null);
    onGuardada();
  }

  if (empleados.length === 0) {
    return (
      <div className="vc-card text-center">
        <p className="mb-3 text-sm">Primero agrega a tus empleados.</p>
        <button className="vc-btn-primary" onClick={onIrEmpleados}>
          Agregar empleados
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {edicion && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amb bg-amb/[.08] px-3 py-2 text-xs">
          <span>
            <strong>Corrigiendo una corrida guardada</strong> ({formatFecha(edicion.inicio)} – {formatFecha(edicion.fin)}). Cambia lo que haga falta,
            calcula y guarda: reemplaza a la anterior.
          </span>
          <button className="whitespace-nowrap font-medium text-blue underline underline-offset-2" onClick={onCancelarEdicion}>
            Cancelar
          </button>
        </div>
      )}
      <div className="vc-card">
        <p className="mb-2 text-sm font-medium">Periodo de pago</p>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Frecuencia">
            <select className="vc-input" value={frecuencia} onChange={(e) => { setFrecuencia(e.target.value as Frecuencia); setResultado(null); }}>
              {(Object.keys(FREC_LABEL) as Frecuencia[]).map((f) => (
                <option key={f} value={f}>{FREC_LABEL[f]}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Fecha de pago">
            <input type="date" className="vc-input" value={fechaPago} onChange={(e) => { setFechaPago(e.target.value); setResultado(null); }} />
          </Campo>
          <Campo label="Periodo desde">
            <input type="date" className="vc-input" value={inicio} onChange={(e) => { setInicio(e.target.value); setResultado(null); }} />
          </Campo>
          <Campo label="Periodo hasta">
            <input type="date" className="vc-input" value={fin} onChange={(e) => { setFin(e.target.value); setResultado(null); }} />
          </Campo>
        </div>
      </div>

      {delPeriodo.length > 0 && (
        <ImportarHoras
          empleados={delPeriodo.map((e) => ({ id: e.id, nombre: e.nombre, tipo_pago: e.tipo_pago }))}
          inicio={inicio}
          fin={fin}
          onAplicar={(horas) => {
            setResultado(null);
            setEntradas((p) => {
              const sig = { ...p };
              for (const e of delPeriodo) {
                const h = horas[e.id];
                if (!h) continue;
                const base = p[e.id] ?? { incluir: true, horasRegulares: "", horasExtra: "", comisiones: "", bonos: "", otrasDeducciones: "" };
                sig[e.id] = {
                  ...base,
                  incluir: true,
                  horasRegulares: e.tipo_pago === "hora" ? String(h.regulares) : base.horasRegulares,
                  horasExtra: String(h.extra),
                };
              }
              return sig;
            });
          }}
        />
      )}

      {delPeriodo.length > 0 && (
        <LicenciasEnCorrida
          entityId={entityId}
          inicio={inicio}
          fin={fin}
          onAplicar={(horas) => {
            setResultado(null);
            setEntradas((p) => {
              const sig = { ...p };
              for (const e of delPeriodo) {
                const h = horas[e.id];
                if (!h || e.tipo_pago !== "hora") continue;
                const base = p[e.id] ?? { incluir: true, horasRegulares: "", horasExtra: "", comisiones: "", bonos: "", otrasDeducciones: "" };
                sig[e.id] = { ...base, incluir: true, horasRegulares: String((Number(base.horasRegulares) || 0) + h) };
              }
              return sig;
            });
          }}
        />
      )}

      {delPeriodo.length > 0 && (
        <BonoNavidad
          entityId={entityId}
          empleadosVisibles={delPeriodo.map((e) => e.id)}
          onAplicar={(montos) => {
            setResultado(null);
            setEntradas((p) => {
              const sig = { ...p };
              for (const e of delPeriodo) {
                const m = montos[e.id];
                if (!m) continue;
                const base = p[e.id] ?? { incluir: true, horasRegulares: "", horasExtra: "", comisiones: "", bonos: "", otrasDeducciones: "" };
                sig[e.id] = { ...base, incluir: true, bonos: String(m) };
              }
              return sig;
            });
          }}
        />
      )}

      {delPeriodo.length === 0 ? (
        <div className="vc-card text-sm text-muted">No tienes empleados con pago {FREC_LABEL[frecuencia].toLowerCase()}.</div>
      ) : (
        delPeriodo.map((e) => {
          const x = entrada(e.id);
          return (
            <div key={e.id} className="vc-card">
              <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={x.incluir} onChange={(ev) => cambiar(e.id, { incluir: ev.target.checked })} />
                {e.nombre}
                <span className="text-xs font-normal text-muted">
                  {e.tipo_pago === "hora" ? `${formatMoney(e.tarifa)}/hora` : `${formatMoney(e.tarifa)} por periodo`}
                </span>
              </label>
              {x.incluir && (
                <div className="grid grid-cols-2 gap-2">
                  {e.tipo_pago === "hora" && (
                    <Campo label="Horas regulares">
                      <input type="number" min="0" step="0.25" className="vc-input" value={x.horasRegulares} onChange={(ev) => cambiar(e.id, { horasRegulares: ev.target.value })} />
                    </Campo>
                  )}
                  <Campo label="Horas extra">
                    <input type="number" min="0" step="0.25" className="vc-input" value={x.horasExtra} onChange={(ev) => cambiar(e.id, { horasExtra: ev.target.value })} />
                  </Campo>
                  <Campo label="Comisiones ($)">
                    <input type="number" min="0" step="0.01" className="vc-input" value={x.comisiones} onChange={(ev) => cambiar(e.id, { comisiones: ev.target.value })} />
                  </Campo>
                  <Campo label="Bonos ($)">
                    <input type="number" min="0" step="0.01" className="vc-input" value={x.bonos} onChange={(ev) => cambiar(e.id, { bonos: ev.target.value })} />
                  </Campo>
                  <Campo label="Otras deducciones ($)">
                    <input type="number" min="0" step="0.01" className="vc-input" value={x.otrasDeducciones} onChange={(ev) => cambiar(e.id, { otrasDeducciones: ev.target.value })} />
                  </Campo>
                </div>
              )}
            </div>
          );
        })
      )}

      {error && <p className="text-xs text-red">{error}</p>}
      <button className="vc-btn-primary" disabled={trabajando || delPeriodo.length === 0} onClick={calcular}>
        {trabajando ? "Calculando..." : "Calcular nómina"}
      </button>

      {resultado && <ResultadoCorrida r={resultado} etiqueta={`${inicio}_${fin}`} onGuardar={guardar} guardando={trabajando} enviaAAprobacion={enviaAAprobacion} editando={!!edicion} />}
    </div>
  );
}

function ResultadoCorrida({
  r,
  etiqueta,
  onGuardar,
  guardando,
  enviaAAprobacion = false,
  editando = false,
}: {
  r: Resultado;
  etiqueta: string;
  onGuardar: () => void;
  guardando: boolean;
  enviaAAprobacion?: boolean;
  editando?: boolean;
}) {
  const t = r.resumen.totales;
  const d = r.resumen.depositos;
  return (
    <div className="flex flex-col gap-3">
      {r.porConfirmar.length > 0 && (
        <div className="rounded-lg border border-amb bg-amb/[.08] px-3 py-2 text-xs">
          Esta corrida usa {r.porConfirmar.length} parámetros aún por confirmar con tu contable.
        </div>
      )}

      <div className="vc-card">
        <p className="mb-2 text-sm font-medium">Resumen de la corrida</p>
        <Fila a="Salario bruto" b={formatMoney(t.bruto)} />
        <Fila a="Retenciones del empleado (impuestos)" b={`− ${formatMoney(t.retencionesEmpleado)}`} />
        {t.deduccionesVoluntarias > 0 && <Fila a="Deducciones voluntarias" b={`− ${formatMoney(t.deduccionesVoluntarias)}`} />}
        <Fila a="Salario neto a pagar" b={formatMoney(t.neto)} fuerte />
        <div className="my-2 border-t border-border" />
        <Fila a="Contribuciones patronales (incluye provisión CFSE)" b={formatMoney(t.contribucionesPatronales)} />
        <Fila a="Costo total para la corporación" b={formatMoney(t.costoTotalPatrono)} fuerte />
      </div>

      <div className="vc-card">
        <p className="mb-1 text-sm font-medium">Montos a depositar</p>
        <p className="mb-2 text-[11px] text-muted">
          {r.vencimiento.trimestre}: vencimiento estimado {formatFecha(r.vencimiento.vence)} (por confirmar). VICTOR no deposita por ti.
        </p>
        <Fila a="IRS — Formulario 941-PR (FICA empleado + patrono)" b={formatMoney(d.irs941)} />
        <Fila a="Hacienda — Formulario 499 R-1B (SURI)" b={formatMoney(d.hacienda499R1B)} />
        <Fila a="DTRH — Desempleo (SUTA) + SINOT + choferil" b={formatMoney(d.dtrh)} />
        <Fila a="IRS — FUTA (Formulario 940-PR)" b={formatMoney(d.futa)} />
        <Fila a="Provisión CFSE (se paga por póliza)" b={formatMoney(d.provisionCfse)} />
      </div>

      <div className="vc-card">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Asiento contable</p>
          <button className="text-xs font-medium text-teal" onClick={() => csvAsiento(r.resumen.asiento, etiqueta)}>
            Descargar CSV
          </button>
        </div>
        <AsientoTabla asiento={r.resumen.asiento} />
        {!r.asientoCuadra && <p className="mt-2 text-xs text-red">El asiento no cuadra — no se puede guardar.</p>}
      </div>

      <p className="text-sm font-medium">Recibos de pago</p>
      {r.lineas.map((l) => (
        <Recibo key={l.employeeId} l={l} />
      ))}

      {r.resumen.advertencias.length > 0 && (
        <div className="vc-card">
          <p className="mb-1 text-sm font-medium">Avisos</p>
          <ul className="list-disc pl-4 text-[11px] text-muted">
            {r.resumen.advertencias.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <button className="vc-btn-primary" disabled={guardando || !r.asientoCuadra} onClick={onGuardar}>
        {guardando ? "Guardando..." : editando ? "Guardar cambios de la corrida" : enviaAAprobacion ? "Enviar corrida al dueño para aprobación" : "Aprobar y guardar corrida"}
      </button>
    </div>
  );
}

function Fila({ a, b, fuerte }: { a: string; b: string; fuerte?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-3 py-0.5 text-sm ${fuerte ? "font-semibold" : ""}`}>
      <span className={fuerte ? "" : "text-muted"}>{a}</span>
      <span className="flex-shrink-0 tabular-nums">{b}</span>
    </div>
  );
}

function AsientoTabla({ asiento }: { asiento: LineaAsiento[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 pr-2 font-medium">Cuenta</th>
            <th className="py-1 pr-2 text-right font-medium">Débito</th>
            <th className="py-1 text-right font-medium">Crédito</th>
          </tr>
        </thead>
        <tbody>
          {asiento.map((l) => (
            <tr key={l.cuenta} className="border-t border-border align-top">
              <td className="py-1 pr-2">
                {l.cuenta}
                {l.nota && <span className="block text-[10px] text-muted">{l.nota}</span>}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{l.debito ? formatMoney(l.debito) : ""}</td>
              <td className="py-1 text-right tabular-nums">{l.credito ? formatMoney(l.credito) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Recibo({ l }: { l: LineaCalc }) {
  return (
    <div className="vc-card">
      <p className="mb-1 text-sm font-medium">{l.nombre}</p>
      <Fila a="Salario bruto" b={formatMoney(l.bruto)} />
      <Fila a="Seguro Social (6.2%)" b={`− ${formatMoney(l.ssEmp)}`} />
      <Fila a="Medicare (1.45%)" b={`− ${formatMoney(l.medicareEmp)}`} />
      {l.medicareAdic > 0 && <Fila a="Medicare adicional (0.9%)" b={`− ${formatMoney(l.medicareAdic)}`} />}
      <Fila a="Contribución sobre ingresos (Hacienda)" b={`− ${formatMoney(l.hacienda)}`} />
      <Fila a="SINOT" b={`− ${formatMoney(l.sinotEmp)}`} />
      {l.choferil > 0 && <Fila a="Seguro de choferes" b={`− ${formatMoney(l.choferil)}`} />}
      {l.deduccionMedico > 0 && <Fila a="Plan médico" b={`− ${formatMoney(l.deduccionMedico)}`} />}
      {l.aporte401k > 0 && <Fila a="401(k)" b={`− ${formatMoney(l.aporte401k)}`} />}
      {l.otrasDeducciones > 0 && <Fila a="Otras deducciones" b={`− ${formatMoney(l.otrasDeducciones)}`} />}
      <div className="my-1 border-t border-border" />
      <Fila a="Neto a pagar" b={formatMoney(l.neto)} fuerte />
      <p className="mt-1 text-[11px] text-muted">
        Costo patronal: FICA {formatMoney(l.ssPat + l.medicarePat)} · SUTA {formatMoney(l.suta)} · FUTA {formatMoney(l.futa)} · SINOT{" "}
        {formatMoney(l.sinotPat)} · CFSE {formatMoney(l.cfse)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empleados
// ---------------------------------------------------------------------------
const VACIO = {
  nombre: "",
  ssn_ultimos4: "",
  email: "",
  frecuencia: "quincenal" as Frecuencia,
  tipo_pago: "salario" as "salario" | "hora",
  tarifa: "",
  estado_civil: "soltero",
  exencion_personal: "completa",
  dependientes: "0",
  allowances_deduccion: "0",
  veterano: false,
  deduccion_especial: false,
  retencion_adicional: "0",
  deduccion_medico: "0",
  aporte_401k: "0",
  es_chofer: false,
  exento_sinot: false,
  joven_exento: false,
  fecha_nacimiento: "",
  ytd_bruto: "",
  ytd_sinot: "",
  ytd_suta: "",
  ytd_futa: "",
};

function EmpleadosTab({
  entityId,
  empleados,
  anio,
  onCambio,
}: {
  entityId: string;
  empleados: Empleado[];
  anio: number;
  onCambio: () => void;
}) {
  const [editando, setEditando] = useState<string | "nuevo" | null>(null);
  const [f, setF] = useState(VACIO);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function abrir(e: Empleado | null) {
    setError(null);
    if (!e) {
      setF(VACIO);
      setEditando("nuevo");
      return;
    }
    setF({
      nombre: e.nombre,
      ssn_ultimos4: e.ssn_ultimos4 ?? "",
      email: e.email ?? "",
      frecuencia: e.frecuencia,
      tipo_pago: e.tipo_pago,
      tarifa: String(e.tarifa),
      estado_civil: e.estado_civil,
      exencion_personal: e.exencion_personal,
      dependientes: String(e.dependientes),
      allowances_deduccion: String(e.allowances_deduccion ?? 0),
      veterano: !!e.veterano,
      deduccion_especial: !!e.deduccion_especial,
      retencion_adicional: String(e.retencion_adicional),
      deduccion_medico: String(e.deduccion_medico),
      aporte_401k: String(e.aporte_401k),
      es_chofer: e.es_chofer,
      exento_sinot: !!e.exento_sinot,
      joven_exento: !!e.joven_exento,
      fecha_nacimiento: e.fecha_nacimiento ? String(e.fecha_nacimiento).slice(0, 10) : "",
      ytd_bruto: e.ytd_inicial?.bruto ? String(e.ytd_inicial.bruto) : "",
      ytd_sinot: e.ytd_inicial?.sinot_base ? String(e.ytd_inicial.sinot_base) : "",
      ytd_suta: e.ytd_inicial?.suta_base ? String(e.ytd_inicial.suta_base) : "",
      ytd_futa: e.ytd_inicial?.futa_base ? String(e.ytd_inicial.futa_base) : "",
    });
    setEditando(e.id);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const conYtd = [f.ytd_bruto, f.ytd_sinot, f.ytd_suta, f.ytd_futa].some((v) => Number(v) > 0);
    const body = {
      entityId,
      nombre: f.nombre,
      ssn_ultimos4: f.ssn_ultimos4,
      email: f.email,
      frecuencia: f.frecuencia,
      tipo_pago: f.tipo_pago,
      tarifa: Number(f.tarifa) || 0,
      estado_civil: f.estado_civil,
      exencion_personal: f.exencion_personal,
      dependientes: Number(f.dependientes) || 0,
      allowances_deduccion: Number(f.allowances_deduccion) || 0,
      veterano: f.veterano,
      deduccion_especial: f.deduccion_especial,
      retencion_adicional: Number(f.retencion_adicional) || 0,
      deduccion_medico: Number(f.deduccion_medico) || 0,
      aporte_401k: Number(f.aporte_401k) || 0,
      es_chofer: f.es_chofer,
      exento_sinot: f.exento_sinot,
      joven_exento: f.joven_exento,
      fecha_nacimiento: f.fecha_nacimiento || null,
      ytd_inicial: {
        bruto: Number(f.ytd_bruto) || 0,
        sinot_base: Number(f.ytd_sinot) || 0,
        suta_base: Number(f.ytd_suta) || 0,
        futa_base: Number(f.ytd_futa) || 0,
      },
      ytd_inicial_anio: conYtd ? anio : null,
    };
    const r = await fetch(editando === "nuevo" ? "/api/nomina/empleados" : `/api/nomina/empleados/${editando}`, {
      method: editando === "nuevo" ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    setGuardando(false);
    if (!r.ok) {
      setError(j?.error ?? "No se pudo guardar.");
      return;
    }
    setEditando(null);
    onCambio();
  }

  async function quitar(e: Empleado) {
    if (!window.confirm(`¿Quitar a ${e.nombre}? Si ya tiene corridas guardadas solo se desactiva.`)) return;
    await fetch(`/api/nomina/empleados/${e.id}`, { method: "DELETE" });
    onCambio();
  }

  const set = (k: keyof typeof VACIO, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  if (editando) {
    return (
      <div className="vc-card flex flex-col gap-2">
        <p className="text-sm font-medium">{editando === "nuevo" ? "Nuevo empleado" : "Editar empleado"}</p>
        <Campo label="Nombre completo">
          <input className="vc-input" value={f.nombre} onChange={(e) => set("nombre", e.target.value)} />
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Seguro Social (últimos 4)" ayuda="No guardamos el número completo.">
            <input className="vc-input" inputMode="numeric" maxLength={4} value={f.ssn_ultimos4} onChange={(e) => set("ssn_ultimos4", e.target.value.replace(/\D/g, ""))} />
          </Campo>
          <Campo label="Email (opcional)">
            <input className="vc-input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          </Campo>
          <Campo label="Frecuencia de pago">
            <select className="vc-input" value={f.frecuencia} onChange={(e) => set("frecuencia", e.target.value)}>
              {(Object.keys(FREC_LABEL) as Frecuencia[]).map((x) => (
                <option key={x} value={x}>{FREC_LABEL[x]}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Tipo de pago">
            <select className="vc-input" value={f.tipo_pago} onChange={(e) => set("tipo_pago", e.target.value)}>
              <option value="salario">Salario fijo</option>
              <option value="hora">Por hora</option>
            </select>
          </Campo>
          <Campo label={f.tipo_pago === "hora" ? "Tarifa por hora ($)" : "Salario por periodo ($)"}>
            <input className="vc-input" type="number" min="0" step="0.01" value={f.tarifa} onChange={(e) => set("tarifa", e.target.value)} />
          </Campo>
        </div>

        <p className="mt-2 text-xs font-medium text-muted">Formulario 499 R-4 (retención de Hacienda)</p>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Estado civil">
            <select className="vc-input" value={f.estado_civil} onChange={(e) => set("estado_civil", e.target.value)}>
              <option value="soltero">Soltero</option>
              <option value="casado_conjunto">Casado, rinde conjunto</option>
              <option value="casado_separado">Casado, rinde por separado</option>
            </select>
          </Campo>
          <Campo label="Exención personal">
            <select className="vc-input" value={f.exencion_personal} onChange={(e) => set("exencion_personal", e.target.value)}>
              <option value="completa">Completa</option>
              <option value="compartida">Compartida</option>
              <option value="ninguna">Ninguna</option>
            </select>
          </Campo>
          <Campo label="Dependientes (Sección B; custodia compartida = 0.5)">
            <input className="vc-input" type="number" min="0" step="0.5" value={f.dependientes} onChange={(e) => set("dependientes", e.target.value)} />
          </Campo>
          <Campo label="Allowances por deducciones (Sección C)">
            <input className="vc-input" type="number" min="0" value={f.allowances_deduccion} onChange={(e) => set("allowances_deduccion", e.target.value)} />
          </Campo>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.veterano} onChange={(e) => set("veterano", e.target.checked)} /> Veterano (+3 allowances)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.deduccion_especial} onChange={(e) => set("deduccion_especial", e.target.checked)} /> Elige deducción especial
          </label>
          <Campo label="Retención adicional por periodo ($)">
            <input className="vc-input" type="number" min="0" step="0.01" value={f.retencion_adicional} onChange={(e) => set("retencion_adicional", e.target.value)} />
          </Campo>
        </div>

        <p className="mt-2 text-xs font-medium text-muted">Deducciones voluntarias (por periodo)</p>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Plan médico ($)">
            <input className="vc-input" type="number" min="0" step="0.01" value={f.deduccion_medico} onChange={(e) => set("deduccion_medico", e.target.value)} />
          </Campo>
          <Campo label="401(k) PR ($)">
            <input className="vc-input" type="number" min="0" step="0.01" value={f.aporte_401k} onChange={(e) => set("aporte_401k", e.target.value)} />
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.es_chofer} onChange={(e) => set("es_chofer", e.target.checked)} />
          Cubierto por el Seguro de Choferes (no paga SINOT)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.exento_sinot} onChange={(e) => set("exento_sinot", e.target.checked)} />
          Exento de SINOT (doméstico o agrícola)
        </label>
        <Campo label="Fecha de nacimiento (para la exención de 26 años o menos)">
          <input className="vc-input" type="date" value={f.fecha_nacimiento} onChange={(e) => set("fecha_nacimiento", e.target.value)} />
        </Campo>
        {!f.fecha_nacimiento && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.joven_exento} onChange={(e) => set("joven_exento", e.target.checked)} />
            Sin fecha de nacimiento: marcar manualmente 26 años o menos
          </label>
        )}

        <p className="mt-2 text-xs font-medium text-muted">Acumulado de {anio} antes de usar VICTOR (opcional)</p>
        <p className="text-[11px] text-muted">Si el empleado ya cobró este año, escribe lo acumulado para que los topes (Seguro Social, SUTA, FUTA, SINOT) cuenten bien.</p>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Salario bruto acumulado ($)">
            <input className="vc-input" type="number" min="0" step="0.01" value={f.ytd_bruto} onChange={(e) => set("ytd_bruto", e.target.value)} />
          </Campo>
          <Campo label="Base SINOT usada ($)">
            <input className="vc-input" type="number" min="0" step="0.01" value={f.ytd_sinot} onChange={(e) => set("ytd_sinot", e.target.value)} />
          </Campo>
          <Campo label="Base SUTA usada ($)">
            <input className="vc-input" type="number" min="0" step="0.01" value={f.ytd_suta} onChange={(e) => set("ytd_suta", e.target.value)} />
          </Campo>
          <Campo label="Base FUTA usada ($)">
            <input className="vc-input" type="number" min="0" step="0.01" value={f.ytd_futa} onChange={(e) => set("ytd_futa", e.target.value)} />
          </Campo>
        </div>

        {error && <p className="text-xs text-red">{error}</p>}
        <div className="flex gap-2">
          <button className="vc-btn-primary" disabled={guardando} onClick={guardar}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button className="rounded-lg border border-border px-4 text-sm text-muted" onClick={() => setEditando(null)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button className="vc-btn-primary" onClick={() => abrir(null)}>
        <i className="ti ti-plus" /> Agregar empleado
      </button>
      {empleados.length === 0 && <p className="text-sm text-muted">Todavía no tienes empleados en esta entidad.</p>}
      {empleados.map((e) => (
        <div key={e.id} className="vc-card flex items-center justify-between gap-2" style={e.activo ? undefined : { opacity: 0.55 }}>
          <div>
            <p className="text-sm font-medium">
              {e.nombre}
              {!e.activo && <span className="ml-2 text-xs text-muted">(inactivo)</span>}
            </p>
            <p className="text-xs text-muted">
              {FREC_LABEL[e.frecuencia]} · {e.tipo_pago === "hora" ? `${formatMoney(e.tarifa)}/hora` : `${formatMoney(e.tarifa)} por periodo`}
              {e.ssn_ultimos4 ? ` · SS ···${e.ssn_ultimos4}` : ""}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-3 text-xs">
            <button className="font-medium text-teal" onClick={() => abrir(e)}>Editar</button>
            <button className="text-muted" onClick={() => quitar(e)}>Quitar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------
function HistorialTab({
  entityId,
  corridas,
  modoContable,
  apruebaDirecto,
  onCambio,
  onEditar,
}: {
  entityId: string;
  corridas: Corrida[];
  modoContable: boolean;
  apruebaDirecto: boolean;
  onCambio: () => void;
  onEditar: (id: string) => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ asiento: LineaAsiento[]; lineas: { id: string; detalle: LineaCalc }[] } | null>(null);

  async function abrir(id: string) {
    if (abierta === id) {
      setAbierta(null);
      setDetalle(null);
      return;
    }
    setAbierta(id);
    setDetalle(null);
    const j = await fetch(`/api/nomina/corridas/${id}`).then((r) => r.json());
    if (j.ok) setDetalle({ asiento: j.corrida.asiento, lineas: j.lineas });
  }

  async function borrar(id: string) {
    if (!window.confirm("¿Eliminar esta corrida? Los acumulados del año vuelven a como estaban antes de ella.")) return;
    const r = await fetch(`/api/nomina/corridas/${id}`, { method: "DELETE" });
    if (!r.ok) window.alert((await r.json().catch(() => null))?.error ?? "No se pudo eliminar.");
    setAbierta(null);
    onCambio();
  }

  async function decidir(id: string, accion: "aprobar" | "rechazar") {
    const msg = accion === "aprobar" ? "¿Aprobar esta corrida? Desde ahora cuenta para los acumulados del año." : "¿Rechazar y eliminar esta corrida pendiente?";
    if (!window.confirm(msg)) return;
    const r = await fetch(`/api/nomina/corridas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion }),
    });
    if (!r.ok) window.alert((await r.json().catch(() => null))?.error ?? "No se pudo completar.");
    setAbierta(null);
    onCambio();
  }

  if (corridas.length === 0)
    return (
      <p className="text-sm text-muted">Todavía no hay corridas guardadas.</p>
    );

  return (
    <div className="flex flex-col gap-3">
      {corridas.map((c) => (
        <div key={c.id} className="vc-card">
          <button className="flex w-full items-start justify-between gap-3 rounded-md text-left transition-colors hover:bg-bg" onClick={() => abrir(c.id)} aria-expanded={abierta === c.id}>
            <div>
              <p className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-blue">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue text-xs leading-none text-white">{abierta === c.id ? "−" : "+"}</span>
                {abierta === c.id ? "Ocultar detalle" : "Ver detalle"}
              </p>
              <p className="text-sm font-medium">
                {formatFecha(c.periodo_inicio)} – {formatFecha(c.periodo_fin)} · {FREC_LABEL[c.frecuencia]}
              </p>
              {c.estado === "pendiente" && (
                <p className="mt-0.5 inline-block rounded-full bg-amb/15 px-2 py-0.5 text-[11px] font-medium text-amb">
                  Pendiente de aprobación del dueño{c.creada_por ? ` · la envió ${c.creada_por}` : ""}
                </p>
              )}
              {c.estado !== "pendiente" && c.creada_por_rol === "contable" && (
                <p className="text-[11px] text-muted">Preparada por el contable ({c.creada_por}){c.aprobada_por && c.aprobada_por !== c.creada_por ? ` · aprobada por ${c.aprobada_por}` : ""}</p>
              )}
              <p className="text-xs text-muted">
                Pago {formatFecha(c.fecha_pago)} · Bruto {formatMoney(Number(c.totales?.bruto ?? 0))} · Neto {formatMoney(Number(c.totales?.neto ?? 0))}
              </p>
              {c.depositos?.vence && (
                <p className="text-[11px] text-muted">
                  {c.depositos.trimestre}: depósitos estimados para {formatFecha(c.depositos.vence)}
                </p>
              )}
            </div>
            <span className="flex-shrink-0 text-sm font-semibold tabular-nums">{formatMoney(Number(c.totales?.costoTotalPatrono ?? 0))}</span>
          </button>

          {abierta === c.id && (
            <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-x-4 text-xs">
                <Fila a="941-PR (IRS)" b={formatMoney(Number(c.depositos?.irs941 ?? 0))} />
                <Fila a="499 R-1B (Hacienda)" b={formatMoney(Number(c.depositos?.hacienda499R1B ?? 0))} />
                <Fila a="DTRH" b={formatMoney(Number(c.depositos?.dtrh ?? 0))} />
                <Fila a="FUTA" b={formatMoney(Number(c.depositos?.futa ?? 0))} />
              </div>
              {!detalle ? (
                <p className="text-xs text-muted">Cargando...</p>
              ) : (
                <>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-medium">Asiento contable</p>
                      <button className="text-xs font-medium text-teal" onClick={() => csvAsiento(detalle.asiento, `${c.periodo_inicio}_${c.periodo_fin}`)}>
                        Descargar CSV
                      </button>
                    </div>
                    <AsientoTabla asiento={detalle.asiento} />
                  </div>
                  {detalle.lineas.map((l) => (
                    <Recibo key={l.id} l={l.detalle} />
                  ))}
                </>
              )}
              {c.estado === "pendiente" && !modoContable && (
                <div className="flex gap-2">
                  <button className="vc-btn-primary" onClick={() => decidir(c.id, "aprobar")}>
                    Aprobar corrida
                  </button>
                  <button className="rounded-lg border border-red px-3 py-2 text-xs font-medium text-red" onClick={() => decidir(c.id, "rechazar")}>
                    Rechazar
                  </button>
                </div>
              )}
              {(!modoContable || c.estado === "pendiente" || apruebaDirecto) && (
                <div className="flex items-center gap-4">
                  <button className="text-xs font-medium text-blue underline underline-offset-2" onClick={() => onEditar(c.id)}>
                    Corregir corrida
                  </button>
                  <button className="text-xs text-red" onClick={() => borrar(c.id)}>
                    Eliminar corrida
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const CAMPO_ETIQ: Record<string, string> = {
  nombre: "nombre",
  tarifa: "salario/tarifa",
  tipo_pago: "tipo de pago",
  frecuencia: "frecuencia",
  estado_civil: "estado civil",
  exencion_personal: "exención personal",
  dependientes: "dependientes",
  allowances_deduccion: "allowances",
  veterano: "veterano",
  deduccion_especial: "deducción especial",
  retencion_adicional: "retención adicional",
  deduccion_medico: "plan médico",
  aporte_401k: "401(k)",
  es_chofer: "chofer",
  exento_sinot: "exento de SINOT",
  joven_exento: "26 años o menos",
  fecha_nacimiento: "fecha de nacimiento",
  fecha_ingreso: "fecha de ingreso",
  activo: "activo",
  email: "correo",
  ssn_ultimos4: "SSN (últimos 4)",
  ytd_inicial: "acumulado inicial",
  ytd_inicial_anio: "año del acumulado",
};

const ACCION_ETIQ: Record<string, string> = {
  empleado_creado: "Creó un empleado",
  empleado_editado: "Editó un empleado",
  empleado_desactivado: "Desactivó un empleado",
  empleado_eliminado: "Eliminó un empleado",
  corrida_aprobada: "Guardó y aprobó una corrida",
  corrida_enviada_a_aprobacion: "Envió una corrida para aprobación",
  corrida_aprobada_por_dueno: "El dueño aprobó una corrida",
  corrida_rechazada_por_dueno: "El dueño rechazó una corrida",
  corrida_editada: "Corrigió una corrida",
  corrida_eliminada: "Eliminó una corrida",
  tasas_actualizadas: "Actualizó las tasas",
  permisos_contable_cambiados: "Cambió los permisos del contable",
  licencia_registrada: "Registró vacaciones/enfermedad",
  licencia_eliminada: "Eliminó un registro de vacaciones/enfermedad",
};

function detalleAuditoria(accion: string, d: Record<string, unknown>): string {
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? "—" : typeof x === "boolean" ? (x ? "sí" : "no") : typeof x === "object" ? JSON.stringify(x) : String(x));
  const partes: string[] = [];
  if (d.empleado) partes.push(String(d.empleado));
  if (d.periodo) partes.push(`periodo ${String(d.periodo).replace(" a ", " – ")}`);
  if (d.bruto !== undefined) partes.push(`bruto ${formatMoney(Number(d.bruto))}`);
  if (accion === "permisos_contable_cambiados") {
    partes.push(`contable puede operar: ${v(d.cpa_puede_nomina)}; aprobación directa: ${v(d.cpa_aprueba_directo)}`);
  }
  const cambios = d.cambios as Record<string, [unknown, unknown]> | undefined;
  if (cambios) {
    const lista = Object.entries(cambios).map(([k, [a, b]]) => `${CAMPO_ETIQ[k] ?? k}: ${v(a)} → ${v(b)}`);
    if (lista.length) partes.push(lista.join("; "));
  }
  return partes.join(" · ");
}

// Auditoría: quién hizo qué en la nómina de esta entidad (dueño y contable la ven).
function AuditoriaTab({ entityId }: { entityId: string }) {
  type Fila = { id: string; actor_email: string | null; actor_rol: string; accion: string; detalle: Record<string, unknown> | null; created_at: string };
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [quien, setQuien] = useState<"todos" | "dueno" | "contable">("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  useEffect(() => {
    let vivo = true;
    setFilas(null);
    const qs = new URLSearchParams({ entityId });
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    fetch(`/api/nomina/auditoria?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => vivo && setFilas(j.filas ?? []))
      .catch(() => vivo && setFilas([]));
    return () => {
      vivo = false;
    };
  }, [entityId, desde, hasta]);

  if (!filas) return <p className="text-sm text-muted">Cargando...</p>;
  const visibles = filas.filter((f) => quien === "todos" || f.actor_rol === quien);
  return (
    <div className="flex flex-col gap-3">
      <div className="vc-card">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Auditoría de la nómina</p>
          <select className="vc-input max-w-[150px]" value={quien} onChange={(e) => setQuien(e.target.value as "todos" | "dueno" | "contable")}>
            <option value="todos">Todos</option>
            <option value="dueno">Solo el dueño</option>
            <option value="contable">Solo el contable</option>
          </select>
        </div>
        <p className="mb-2 text-[11px] text-muted">Quién hizo cada cambio y cuándo. Lo ven el dueño y el contable.</p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Campo label="Desde">
            <input type="date" className="vc-input" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
          </Campo>
          <Campo label="Hasta">
            <input type="date" className="vc-input" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          </Campo>
          {(desde || hasta) && (
            <button type="button" className="col-span-2 text-left text-xs font-medium text-blue underline underline-offset-2" onClick={() => { setDesde(""); setHasta(""); }}>
              Quitar filtro de fechas
            </button>
          )}
        </div>
        {visibles.length === 0 ? (
          <p className="text-xs text-muted">Todavía no hay actividad registrada.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border text-xs">
            {visibles.map((f) => {
              const det = detalleAuditoria(f.accion, f.detalle ?? {});
              return (
                <div key={f.id} className="py-2">
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{ACCION_ETIQ[f.accion] ?? f.accion}</span>
                    <span className="whitespace-nowrap text-muted">
                      {new Date(f.created_at).toLocaleString("es-PR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </p>
                  <p className="text-muted">
                    {f.actor_rol === "contable" ? "Contable" : "Dueño"} · {f.actor_email ?? "—"}
                  </p>
                  {det && <p className="mt-0.5 break-words">{det}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tasas
// ---------------------------------------------------------------------------
function TasasTab({
  entityId,
  config,
  parametros,
  anio,
  modoContable = false,
  onGuardado,
}: {
  entityId: string;
  config: Config | null;
  parametros: ParamFila[];
  anio: number;
  modoContable?: boolean;
  onGuardado: () => void;
}) {
  const [suta, setSuta] = useState("");
  const [cfse, setCfse] = useState("");
  const [poliza, setPoliza] = useState("");
  const [codigo, setCodigo] = useState("");
  const [futa, setFuta] = useState(true);
  const [bonoActivo, setBonoActivo] = useState(true);
  const [bonoPct, setBonoPct] = useState("");
  const [bonoTope, setBonoTope] = useState("");
  const [bonoHoras, setBonoHoras] = useState("");
  const [bonoIni, setBonoIni] = useState("");
  const [bonoFin, setBonoFin] = useState("");
  const [bonoPago, setBonoPago] = useState("");
  const [lic, setLic] = useState<Record<string, string>>({});
  const setL = (k: string, v: string) => setLic((p) => ({ ...p, [k]: v }));
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ks = ["vac_dias_mes", "vac_meses_espera", "vac_tope", "enf_dias_mes", "enf_meses_espera", "enf_tope", "horas_por_dia"] as const;
    setLic(Object.fromEntries(ks.map((k) => [k, config?.[k] != null ? String(config[k]) : ""])));
    setSuta(config?.suta_tasa != null ? String(+(Number(config.suta_tasa) * 100).toFixed(4)) : "");
    setCfse(config?.cfse_tasa != null ? String(+(Number(config.cfse_tasa) * 100).toFixed(4)) : "");
    setPoliza(config?.cfse_poliza ?? "");
    setCodigo(config?.cfse_codigo_riesgo ?? "");
    setFuta(config?.futa_aplica ?? true);
    setBonoActivo(config?.bono_activo ?? true);
    setBonoPct(config?.bono_pct != null ? String(+(Number(config.bono_pct) * 100).toFixed(4)) : "");
    setBonoTope(config?.bono_tope != null ? String(config.bono_tope) : "");
    setBonoHoras(config?.bono_horas_min != null ? String(config.bono_horas_min) : "");
    setBonoIni(config?.bono_inicio ?? "");
    setBonoFin(config?.bono_fin ?? "");
    setBonoPago(config?.bono_fecha_pago ?? "");
  }, [config]);

  async function guardar() {
    setMsg(null);
    setError(null);
    const r = await fetch("/api/nomina/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, suta_pct: suta, cfse_pct: cfse, cfse_poliza: poliza, cfse_codigo_riesgo: codigo, futa_aplica: futa,
        bono_activo: bonoActivo, bono_pct: bonoPct, bono_tope: bonoTope, bono_horas_min: bonoHoras, bono_inicio: bonoIni, bono_fin: bonoFin, bono_fecha_pago: bonoPago,
        ...lic,
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      setError(j?.error ?? "No se pudo guardar.");
      return;
    }
    setMsg("Guardado.");
    onGuardado();
  }

  const formato = (p: ParamFila) =>
    p.valor > 0 && p.valor < 1 ? `${+(p.valor * 100).toFixed(4)}%` : p.valor >= 1000 ? formatMoney(p.valor, 0) : String(p.valor);

  async function cambiarPermiso(campo: "cpa_puede_nomina" | "cpa_aprueba_directo", valor: boolean) {
    setMsg(null);
    setError(null);
    const r = await fetch("/api/nomina/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, [campo]: valor }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      setError(j?.error ?? "No se pudo guardar el permiso.");
      return;
    }
    onGuardado();
  }

  return (
    <div className="flex flex-col gap-3">
      {!modoContable ? (
        <div className="vc-card flex flex-col gap-2">
          <p className="text-sm font-medium">Tu contable y la nómina</p>
          <p className="text-[11px] text-muted">Tú decides si tu contable puede trabajar la nómina de esta entidad desde su portal.</p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={!!config?.cpa_puede_nomina}
              onChange={(e) => cambiarPermiso("cpa_puede_nomina", e.target.checked)}
            />
            <span>
              Permitir que mi contable corra la nómina
              <span className="block text-[11px] text-muted">Podrá crear y editar empleados y generar corridas. Todo queda registrado con su nombre.</span>
            </span>
          </label>
          <label className={`flex items-start gap-2 text-sm ${config?.cpa_puede_nomina ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              className="mt-0.5"
              disabled={!config?.cpa_puede_nomina}
              checked={!!config?.cpa_aprueba_directo}
              onChange={(e) => cambiarPermiso("cpa_aprueba_directo", e.target.checked)}
            />
            <span>
              Sus corridas quedan aprobadas sin mi autorización
              <span className="block text-[11px] text-muted">
                Apagado: cada corrida que tire el contable queda pendiente hasta que tú la apruebes en el Historial.
              </span>
            </span>
          </label>
        </div>
      ) : (
        <div className="vc-card text-xs text-muted">
          {config?.cpa_aprueba_directo
            ? "El dueño te permite aprobar las corridas directamente."
            : "Las corridas que generes quedan pendientes hasta que el dueño las apruebe."}
        </div>
      )}
      <div className="vc-card flex flex-col gap-2">
        <p className="text-sm font-medium">Tasas de esta entidad</p>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="SUTA — tasa patronal (%)" ayuda="La asigna el DTRH según tu experiencia. Vacío = tasa por defecto.">
            <input className="vc-input" type="number" min="0" step="0.01" value={suta} onChange={(e) => setSuta(e.target.value)} />
          </Campo>
          <Campo label="CFSE — tasa de riesgo (%)" ayuda="Según tu póliza. Vacío = $0 de provisión.">
            <input className="vc-input" type="number" min="0" step="0.01" value={cfse} onChange={(e) => setCfse(e.target.value)} />
          </Campo>
          <Campo label="Póliza CFSE">
            <input className="vc-input" value={poliza} onChange={(e) => setPoliza(e.target.value)} />
          </Campo>
          <Campo label="Código de riesgo">
            <input className="vc-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={futa} onChange={(e) => setFuta(e.target.checked)} />
          Esta entidad paga FUTA (desempleo federal)
        </label>
        <div className="mt-2 border-t border-border pt-3">
          <p className="mb-1 text-sm font-medium">Bono de Navidad</p>
          <p className="mb-2 text-[11px] text-muted">
            Escribe las reglas que le aplican a tu negocio. Si dejas un campo vacío, VICTOR usa una sugerencia (6 %, tope $600, 700 horas, período 10-01 a 09-30, pago 12-15)
            marcada «por confirmar» con tu contable.
          </p>
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={bonoActivo} onChange={(e) => setBonoActivo(e.target.checked)} />
            Calcular Bono de Navidad en esta entidad
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Porcentaje del salario (%)" ayuda="Ej. 6 = 6 % del salario del período.">
              <input className="vc-input" type="number" min="0" max="100" step="0.01" value={bonoPct} onChange={(e) => setBonoPct(e.target.value)} />
            </Campo>
            <Campo label="Tope por empleado ($)">
              <input className="vc-input" type="number" min="0" step="0.01" value={bonoTope} onChange={(e) => setBonoTope(e.target.value)} />
            </Campo>
            <Campo label="Horas mínimas trabajadas">
              <input className="vc-input" type="number" min="0" step="1" value={bonoHoras} onChange={(e) => setBonoHoras(e.target.value)} />
            </Campo>
            <Campo label="Fecha límite de pago (MM-DD)">
              <input className="vc-input" placeholder="12-15" value={bonoPago} onChange={(e) => setBonoPago(e.target.value)} />
            </Campo>
            <Campo label="Período desde (MM-DD)">
              <input className="vc-input" placeholder="10-01" value={bonoIni} onChange={(e) => setBonoIni(e.target.value)} />
            </Campo>
            <Campo label="Período hasta (MM-DD)">
              <input className="vc-input" placeholder="09-30" value={bonoFin} onChange={(e) => setBonoFin(e.target.value)} />
            </Campo>
          </div>
        </div>
        <div className="mt-2 border-t border-border pt-3">
          <p className="mb-1 text-sm font-medium">Vacaciones y enfermedad</p>
          <p className="mb-2 text-[11px] text-muted">
            Escribe cuántos días se acumulan por mes trabajado, cuántos meses esperar antes de acumular y el máximo que se puede acumular. Si dejas un campo vacío, VICTOR usa una
            sugerencia (vacaciones 1.25 días/mes, tope 30; enfermedad 1 día/mes, tope 15; 8 horas por día) marcada «por confirmar» con tu contable.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Campo label="Vacaciones: días/mes"><input className="vc-input" type="number" min="0" step="0.01" value={lic.vac_dias_mes ?? ""} onChange={(e) => setL("vac_dias_mes", e.target.value)} /></Campo>
            <Campo label="Espera (meses)"><input className="vc-input" type="number" min="0" step="1" value={lic.vac_meses_espera ?? ""} onChange={(e) => setL("vac_meses_espera", e.target.value)} /></Campo>
            <Campo label="Tope (días)"><input className="vc-input" type="number" min="0" step="1" value={lic.vac_tope ?? ""} onChange={(e) => setL("vac_tope", e.target.value)} /></Campo>
            <Campo label="Enfermedad: días/mes"><input className="vc-input" type="number" min="0" step="0.01" value={lic.enf_dias_mes ?? ""} onChange={(e) => setL("enf_dias_mes", e.target.value)} /></Campo>
            <Campo label="Espera (meses)"><input className="vc-input" type="number" min="0" step="1" value={lic.enf_meses_espera ?? ""} onChange={(e) => setL("enf_meses_espera", e.target.value)} /></Campo>
            <Campo label="Tope (días)"><input className="vc-input" type="number" min="0" step="1" value={lic.enf_tope ?? ""} onChange={(e) => setL("enf_tope", e.target.value)} /></Campo>
            <Campo label="Horas por día"><input className="vc-input" type="number" min="0" step="0.5" value={lic.horas_por_dia ?? ""} onChange={(e) => setL("horas_por_dia", e.target.value)} /></Campo>
          </div>
        </div>
        {error && <p className="text-xs text-red">{error}</p>}
        {msg && <p className="text-xs text-teal">{msg}</p>}
        <button className="vc-btn-primary" onClick={guardar}>Guardar tasas</button>
      </div>

      <div className="vc-card">
        <p className="mb-1 text-sm font-medium">Tasas y topes generales ({anio})</p>
        <p className="mb-2 text-[11px] text-muted">
          Los marcados «por confirmar» vienen de una guía externa y no están validados. Cuando tu contable los confirme, se corrigen
          en la tabla payroll_params sin tocar el código.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {parametros.map((p) => (
                <tr key={p.clave} className="border-t border-border align-top">
                  <td className="py-1 pr-2">
                    {p.descripcion ?? p.clave}
                    <span className="block text-[10px] text-muted">{p.jurisdiccion === "pr" ? "Puerto Rico" : "Federal"} · {p.clave}</span>
                  </td>
                  <td className="whitespace-nowrap py-1 pr-2 text-right tabular-nums">{formato(p)}</td>
                  <td className="whitespace-nowrap py-1 text-right">
                    {p.por_confirmar ? <span className="text-amb">por confirmar</span> : <span className="text-teal">confirmado</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
