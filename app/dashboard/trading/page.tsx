"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import {
  REGLAS_POR_DEFECTO,
  NOMBRE_REGLA,
  calcularLote,
  calcularMetricas,
  contratoDe,
  evaluarCumplimiento,
  leerReporteMT5,
  type ReglasRiesgo,
  type Trade,
} from "@/lib/trading";

// Módulo Trading (oct 2026) — organizador, NO da señales ni consejos.
// v1: cuenta, subir reporte MT5, bitácora y manejo de riesgo (reglas propias,
// calculadora de lote y control de cumplimiento). Cálculo en lib/trading.ts.
type Cuenta = { id: string; nombre: string; tipo: "demo" | "real"; balance_inicial: number; numero_cuenta: string | null; broker: string | null };
type FilaTrade = {
  id: string;
  ticket: string;
  simbolo: string;
  lado: "buy" | "sell";
  volumen: number;
  hora_apertura: string;
  precio_apertura: number | null;
  sl: number | null;
  tp: number | null;
  hora_cierre: string | null;
  precio_cierre: number | null;
  comision: number;
  swap: number;
  ganancia: number;
  nota: string | null;
  cumpli_plan: boolean | null;
};

const fechaHora = (s: string) => `${s.slice(5, 7)}/${s.slice(8, 10)} ${s.slice(11, 16)}`;
const dur = (s: number) => (s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

export default function TradingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<"bitacora" | "riesgo">("bitacora");
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [trades, setTrades] = useState<FilaTrade[]>([]);
  const [reglas, setReglas] = useState<ReglasRiesgo>(REGLAS_POR_DEFECTO);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soloRotas, setSoloRotas] = useState(false);

  // Formulario de cuenta nueva
  const [nNombre, setNNombre] = useState("");
  const [nTipo, setNTipo] = useState<"demo" | "real">("demo");
  const [nBalance, setNBalance] = useState("");

  // Calculadora
  const [cBalance, setCBalance] = useState("");
  const [cSimbolo, setCSimbolo] = useState("XAUUSD");
  const [cSL, setCSL] = useState("6");
  const [cContrato, setCContrato] = useState("");

  const cuenta = cuentas.find((c) => c.id === cuentaId) ?? null;

  async function cargar(preferida?: string) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return router.push("/login");
    const [{ data: cs }, { data: rr }] = await Promise.all([
      supabase.from("trading_accounts").select("id, nombre, tipo, balance_inicial, numero_cuenta, broker").order("created_at"),
      supabase.from("risk_rules").select("*").eq("owner_id", u.user.id).maybeSingle(),
    ]);
    const lista = ((cs ?? []) as Cuenta[]).map((c) => ({ ...c, balance_inicial: Number(c.balance_inicial) }));
    setCuentas(lista);
    if (rr) setReglas({ ...REGLAS_POR_DEFECTO, ...(Object.fromEntries(Object.entries(rr).filter(([k]) => k in REGLAS_POR_DEFECTO)) as Partial<ReglasRiesgo>) });
    const id = preferida ?? cuentaId ?? lista[0]?.id ?? null;
    setCuentaId(id);
    if (id) await cargarTrades(id);
    setCargando(false);
  }

  async function cargarTrades(id: string) {
    const { data } = await supabase.from("trades").select("*").eq("account_id", id).order("hora_apertura", { ascending: false }).limit(2000);
    setTrades(
      ((data ?? []) as FilaTrade[]).map((t) => ({
        ...t,
        volumen: Number(t.volumen),
        precio_apertura: t.precio_apertura === null ? null : Number(t.precio_apertura),
        sl: t.sl === null ? null : Number(t.sl),
        tp: t.tp === null ? null : Number(t.tp),
        precio_cierre: t.precio_cierre === null ? null : Number(t.precio_cierre),
        comision: Number(t.comision),
        swap: Number(t.swap),
        ganancia: Number(t.ganancia),
      }))
    );
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function crearCuenta() {
    setError(null);
    if (!nNombre.trim()) return setError("Ponle un nombre a la cuenta.");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error: e } = await supabase
      .from("trading_accounts")
      .insert({ owner_id: u.user.id, nombre: nNombre.trim(), tipo: nTipo, balance_inicial: Number(nBalance) || 0 })
      .select("id")
      .single();
    if (e || !data) return setError("No se pudo crear la cuenta.");
    setNNombre("");
    setNBalance("");
    await cargar(data.id);
  }

  async function subirReporte(file: File) {
    if (!cuenta) return;
    setError(null);
    setMsg(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const filas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
      const rep = leerReporteMT5(filas);
      if (rep.trades.length === 0) return setError("No encontré trades en ese archivo. Usa el reporte Excel de MT5 (Historial → clic derecho → Reporte → Excel).");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const filasDb = rep.trades.map((t) => ({ ...t, owner_id: u.user!.id, account_id: cuenta.id }));
      for (let i = 0; i < filasDb.length; i += 200) {
        const { error: e } = await supabase.from("trades").upsert(filasDb.slice(i, i + 200), { onConflict: "account_id,ticket", ignoreDuplicates: true });
        if (e) return setError("No se pudieron guardar los trades.");
      }
      if (rep.cuenta && !cuenta.numero_cuenta) {
        await supabase.from("trading_accounts").update({ numero_cuenta: rep.cuenta, broker: rep.broker }).eq("id", cuenta.id);
      }
      setMsg(`Se leyeron ${rep.trades.length} trades. Los que ya estaban no se duplican.`);
      await cargar(cuenta.id);
    } catch {
      setError("No pude leer el archivo.");
    }
  }

  async function guardarReglas() {
    setError(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error: e } = await supabase.from("risk_rules").upsert({ owner_id: u.user.id, ...reglas, updated_at: new Date().toISOString() });
    if (e) return setError("No se pudieron guardar las reglas. Revisa que los números sean válidos.");
    setMsg("Reglas guardadas.");
  }

  async function guardarNota(t: FilaTrade, nota: string, cumpli: boolean | null) {
    await supabase.from("trades").update({ nota: nota.trim() || null, cumpli_plan: cumpli }).eq("id", t.id);
    setTrades((prev) => prev.map((x) => (x.id === t.id ? { ...x, nota: nota.trim() || null, cumpli_plan: cumpli } : x)));
  }

  const evaluados = useMemo(
    () => evaluarCumplimiento(trades as unknown as Trade[], reglas, cuenta?.balance_inicial ?? 0),
    [trades, reglas, cuenta]
  );
  const metricas = useMemo(() => calcularMetricas(evaluados, cuenta?.balance_inicial ?? 0), [evaluados, cuenta]);
  const porTicket = useMemo(() => new Map(evaluados.map((e) => [e.ticket, e])), [evaluados]);
  const filas = trades.filter((t) => !soloRotas || (porTicket.get(t.ticket)?.violaciones.length ?? 0) > 0);

  const contratoAuto = contratoDe(cSimbolo);
  const contrato = Number(cContrato) || contratoAuto || 0;
  const balanceCalc = Number(cBalance) || (cuenta ? cuenta.balance_inicial + metricas.neto : 0);
  const lote = contrato
    ? calcularLote({ balance: balanceCalc, riesgoPct: reglas.riesgo_por_trade_pct, distanciaSL: Number(cSL) || 0, contrato })
    : null;

  const campoRegla = (k: keyof ReglasRiesgo, etiqueta: string, ayuda?: string) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted">{etiqueta}</span>
      <input
        className="vc-input"
        inputMode="decimal"
        value={String(reglas[k])}
        onChange={(e) => setReglas({ ...reglas, [k]: Number(e.target.value) || 0 })}
      />
      {ayuda && <span className="text-[10px] text-muted">{ayuda}</span>}
    </label>
  );

  if (cargando) return <div className="vc-shell"><p className="text-xs text-muted">Cargando...</p></div>;

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Mi negocio de trading</h1>
        <button onClick={() => router.push("/dashboard")} className="vc-btn-back">Volver</button>
      </div>

      <p className="mb-4 text-[11px] text-muted">
        Esta herramienta organiza tus operaciones y mide si cumples tus propias reglas. No da señales, recomendaciones ni asesoría financiera, fiscal o legal.
      </p>

      {error && <p className="mb-3 text-xs text-red">{error}</p>}
      {msg && <p className="mb-3 text-xs text-teal">{msg}</p>}

      {cuentas.length === 0 ? (
        <div className="vc-card flex flex-col gap-3">
          <p className="text-sm font-medium">Crea tu primera cuenta</p>
          <input className="vc-input" placeholder="Nombre (ej. Axi real)" value={nNombre} onChange={(e) => setNNombre(e.target.value)} maxLength={80} />
          <div className="flex gap-2">
            <select className="vc-input" value={nTipo} onChange={(e) => setNTipo(e.target.value as "demo" | "real")}>
              <option value="demo">Demo</option>
              <option value="real">Real</option>
            </select>
            <input className="vc-input" inputMode="decimal" placeholder="Balance inicial $" value={nBalance} onChange={(e) => setNBalance(e.target.value)} />
          </div>
          <button className="vc-btn-primary" onClick={crearCuenta}>Crear cuenta</button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <select
              className="vc-input"
              value={cuentaId ?? ""}
              onChange={async (e) => {
                setCuentaId(e.target.value);
                await cargarTrades(e.target.value);
              }}
            >
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>
              ))}
            </select>
            <label className="vc-btn-primary cursor-pointer whitespace-nowrap text-center">
              Subir reporte
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && subirReporte(e.target.files[0])} />
            </label>
          </div>

          <div className="mb-4 flex gap-2">
            {(["bitacora", "riesgo"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-pill px-3 py-1 text-xs font-medium ${tab === t ? "bg-[#1B3A5C] text-white" : "border border-border text-muted"}`}
              >
                {t === "bitacora" ? "Bitácora" : "Riesgo"}
              </button>
            ))}
          </div>

          {/* KPIs */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Resultado", formatMoney(metricas.neto)],
              ["Aciertos", `${metricas.winRate.toFixed(0)}%`],
              ["Factor de beneficio", metricas.profitFactor === null ? "—" : metricas.profitFactor.toFixed(2)],
              ["Caída máxima", `${formatMoney(metricas.caidaMaxima, 0)} (${metricas.caidaMaximaPct.toFixed(0)}%)`],
              ["Disciplina", `${metricas.disciplina.toFixed(0)}%`],
              ["Trades", String(metricas.trades)],
              ["Por trade (promedio)", formatMoney(metricas.expectativa)],
              ["Peor racha perdedora", String(metricas.rachaPerdedoraMax)],
            ].map(([k, v]) => (
              <div key={k} className="vc-card !p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted">{k}</p>
                <p className="text-sm font-medium">{v}</p>
              </div>
            ))}
          </div>

          {tab === "bitacora" && (
            <>
              <label className="mb-3 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={soloRotas} onChange={(e) => setSoloRotas(e.target.checked)} />
                Ver solo trades donde rompí alguna regla
              </label>
              {filas.length === 0 ? (
                <div className="vc-card text-center text-xs text-muted">
                  {trades.length === 0 ? "Sube el reporte Excel de MT5 para ver tus trades." : "Ningún trade con reglas rotas."}
                </div>
              ) : (
                <div className="vc-card !p-0 divide-y divide-border">
                  {filas.map((t) => {
                    const ev = porTicket.get(t.ticket);
                    const n = t.ganancia + t.comision + t.swap;
                    return (
                      <details key={t.id} className="px-4 py-2.5">
                        <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs">
                          <span>
                            <span className="font-medium">{t.simbolo}</span> {t.lado === "buy" ? "compra" : "venta"} {t.volumen}
                            <span className="ml-2 text-muted">{fechaHora(t.hora_apertura)}</span>
                            {ev && ev.violaciones.length > 0 && <span className="ml-2 text-red">⚠ {ev.violaciones.length}</span>}
                          </span>
                          <span className={n >= 0 ? "text-teal" : "text-red"}>{formatMoney(n)}</span>
                        </summary>
                        <div className="mt-2 flex flex-col gap-2 text-[11px] text-muted">
                          <p>
                            Duración {ev ? dur(ev.duracionSeg) : "—"} · SL {t.sl ?? "no puso"} · TP {t.tp ?? "no puso"} · hora del broker
                          </p>
                          {ev?.violaciones.map((v) => (
                            <p key={v} className="text-red">• {NOMBRE_REGLA[v]}</p>
                          ))}
                          <NotaTrade t={t} onGuardar={guardarNota} />
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "riesgo" && (
            <>
              <div className="vc-card mb-4 flex flex-col gap-3">
                <p className="text-xs uppercase tracking-wide text-muted">Mis reglas de riesgo</p>
                <div className="grid grid-cols-2 gap-3">
                  {campoRegla("riesgo_por_trade_pct", "Riesgo por trade (% del balance)")}
                  {campoRegla("perdida_max_dia_pct", "Pérdida máxima del día (%)")}
                  {campoRegla("max_perdedores_dia", "Máx. trades perdedores al día")}
                  {campoRegla("max_trades_dia", "Máx. trades al día")}
                  {campoRegla("espera_tras_perdida_min", "Espera tras una pérdida (min)", "0 = sin espera")}
                  {campoRegla("duracion_min_seg", "Duración mínima del trade (seg)")}
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={reglas.sl_obligatorio} onChange={(e) => setReglas({ ...reglas, sl_obligatorio: e.target.checked })} />
                  Stop loss obligatorio
                </label>
                <button className="vc-btn-primary" onClick={guardarReglas}>Guardar reglas</button>
                <p className="text-[10px] text-muted">Los valores iniciales son solo un punto de partida educativo. Son tus reglas: ajústalas a tu plan.</p>
              </div>

              <div className="vc-card mb-4 flex flex-col gap-3">
                <p className="text-xs uppercase tracking-wide text-muted">Calculadora de lote</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="flex flex-col gap-1"><span className="text-muted">Balance $</span>
                    <input className="vc-input" inputMode="decimal" placeholder={String(balanceCalc.toFixed(2))} value={cBalance} onChange={(e) => setCBalance(e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-muted">Símbolo</span>
                    <input className="vc-input" value={cSimbolo} onChange={(e) => setCSimbolo(e.target.value.toUpperCase())} />
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-muted">Distancia al stop (precio)</span>
                    <input className="vc-input" inputMode="decimal" value={cSL} onChange={(e) => setCSL(e.target.value)} />
                  </label>
                  {!contratoAuto && (
                    <label className="flex flex-col gap-1"><span className="text-muted">Unidades por lote</span>
                      <input className="vc-input" inputMode="decimal" placeholder="Lo da tu broker" value={cContrato} onChange={(e) => setCContrato(e.target.value)} />
                    </label>
                  )}
                </div>
                {lote ? (
                  <div className="rounded-lg bg-bg p-3 text-sm">
                    <p>Riesgo permitido: <span className="font-medium">{formatMoney(lote.riesgoUSD)}</span> ({reglas.riesgo_por_trade_pct}%)</p>
                    <p>Lote máximo: <span className="font-medium">{lote.lote.toFixed(2)}</span></p>
                    {lote.loteMinimoExcede && (
                      <p className="mt-1 text-xs text-red">
                        Ni el lote mínimo cabe en tu regla: con 0.01 arriesgarías {formatMoney(lote.riesgoConLoteMinimo)}. Reduce el stop o sube el balance.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted">Escribe las unidades por lote de ese símbolo para calcular.</p>
                )}
              </div>

              <div className="vc-card">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted">Reglas rotas en esta cuenta</p>
                {metricas.trades === 0 ? (
                  <p className="text-xs text-muted">Sube un reporte para ver el cumplimiento.</p>
                ) : (
                  <div className="flex flex-col gap-1 text-xs">
                    {(Object.keys(NOMBRE_REGLA) as (keyof typeof NOMBRE_REGLA)[]).map((r) => (
                      <p key={r} className="flex justify-between">
                        <span>{NOMBRE_REGLA[r]}</span>
                        <span className={metricas.reglasRotas[r] > 0 ? "text-red" : "text-muted"}>{metricas.reglasRotas[r]}</span>
                      </p>
                    ))}
                    <p className="mt-2 text-[10px] text-muted">
                      El riesgo por trade solo se calcula en instrumentos conocidos (oro, forex, índices, cripto). La disciplina es el % de trades sin ninguna regla rota.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function NotaTrade({ t, onGuardar }: { t: FilaTrade; onGuardar: (t: FilaTrade, nota: string, cumpli: boolean | null) => void }) {
  const [nota, setNota] = useState(t.nota ?? "");
  const [cumpli, setCumpli] = useState<boolean | null>(t.cumpli_plan);
  return (
    <div className="flex flex-col gap-2">
      <textarea className="vc-input" rows={2} placeholder="Nota: ¿por qué entraste?" value={nota} onChange={(e) => setNota(e.target.value)} />
      <div className="flex items-center gap-2">
        <span>¿Cumplí mi plan?</span>
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => setCumpli(cumpli === v ? null : v)}
            className={`rounded-pill px-3 py-0.5 ${cumpli === v ? "bg-[#1B3A5C] text-white" : "border border-border"}`}
          >
            {v ? "Sí" : "No"}
          </button>
        ))}
        <button type="button" className="ml-auto text-teal" onClick={() => onGuardar(t, nota, cumpli)}>Guardar</button>
      </div>
    </div>
  );
}
