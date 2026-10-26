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
  infoSimbolo,
  SIMBOLOS,
  USD_POR_MONEDA,
  curvaCapital,
  evaluarCumplimiento,
  impactoReglas,
  leerReporteMT5,
  resultadosPorDia,
  type ReglasRiesgo,
  type Trade,
  type TradeEvaluado,
} from "@/lib/trading";
import { generarGuardianMQ5 } from "@/lib/trading-guard";
import { Anillo, Calendario, CurvaCapital, nombreMes } from "./graficos";

// Módulo Trading (oct 2026) — organizador, NO da señales ni consejos.
// Panel (calendario, curva, perfil), Bitácora por mes y por día, y Riesgo
// (reglas propias, impacto, guardián descargable para MT5, calculadora).
type Cuenta = {
  id: string;
  nombre: string;
  tipo: "demo" | "real";
  balance_inicial: number;
  numero_cuenta: string | null;
  broker: string | null;
  balance_actual: number | null;
  equity_actual: number | null;
  last_sync_at: string | null;
};
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
type Guardian = {
  guard_symbol: string;
  guard_sl_pips: number;
  guard_pip_size: number;
  guard_reward_ratio: number;
  guard_max_open: number;
  guard_daily_loss_usd: number | null;
  guard_min_equity_usd: number | null;
  guard_lock_mode: "total" | "flexible" | "ninguno";
  guard_block_manual_close: boolean;
};
const GUARDIAN_POR_DEFECTO: Guardian = {
  guard_symbol: "XAUUSD",
  guard_sl_pips: 60,
  guard_pip_size: 0.1,
  guard_reward_ratio: 2,
  guard_max_open: 1,
  guard_daily_loss_usd: null,
  guard_min_equity_usd: null,
  guard_lock_mode: "flexible",
  guard_block_manual_close: true,
};

const fechaCorta = (s: string) => `${s.slice(5, 7)}/${s.slice(8, 10)}`;
const horaCorta = (s: string) => s.slice(11, 16);
const dur = (s: number) => (s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const fechaCierre = (t: { hora_cierre: string | null; hora_apertura: string }) => (t.hora_cierre ?? t.hora_apertura).slice(0, 10);
const DIAS_SEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const nombreDia = (f: string) => `${DIAS_SEM[new Date(f + "T00:00:00Z").getUTCDay()]} ${f.slice(5, 7)}/${f.slice(8, 10)}`;

// Input numérico que deja escribir "2." o "0.5" sin comerse el punto.
function NumInput({ value, onChange, placeholder }: { value: number | null; onChange: (n: number | null) => void; placeholder?: string }) {
  const [txt, setTxt] = useState(value === null ? "" : String(value));
  useEffect(() => {
    const actual = txt.trim() === "" ? null : Number(txt.replace(",", "."));
    if (actual !== value) setTxt(value === null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className="vc-input"
      inputMode="decimal"
      placeholder={placeholder}
      value={txt}
      onChange={(e) => {
        setTxt(e.target.value);
        const t = e.target.value.trim().replace(",", ".");
        if (t === "") return onChange(null);
        const n = Number(t);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export default function TradingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<"panel" | "bitacora" | "riesgo">("panel");
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [trades, setTrades] = useState<FilaTrade[]>([]);
  const [reglas, setReglas] = useState<ReglasRiesgo>(REGLAS_POR_DEFECTO);
  const [guardian, setGuardian] = useState<Guardian>(GUARDIAN_POR_DEFECTO);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soloRotas, setSoloRotas] = useState(false);
  const [mes, setMes] = useState<string>("todo");
  const [calMes, setCalMes] = useState<string>("");
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [balanceEdit, setBalanceEdit] = useState<number | null>(null);

  // Formulario de cuenta nueva
  const [nNombre, setNNombre] = useState("");
  const [nTipo, setNTipo] = useState<"demo" | "real">("demo");
  const [nBalance, setNBalance] = useState<number | null>(null);
  const [mostrarNueva, setMostrarNueva] = useState(false);

  // Calculadora
  const [cBalance, setCBalance] = useState<number | null>(null);
  const [cSimbolo, setCSimbolo] = useState("XAUUSD");
  const [cPips, setCPips] = useState<number | null>(60);
  const [cContrato, setCContrato] = useState<number | null>(null);
  const [cPipSize, setCPipSize] = useState<number | null>(null);
  const [cFx, setCFx] = useState<number | null>(null);

  const cuenta = cuentas.find((c) => c.id === cuentaId) ?? null;

  // Los avisos son flotantes (se ven aunque estés abajo en la página) y se quitan solos.
  useEffect(() => {
    if (!error && !msg) return;
    const t = setTimeout(() => {
      setError(null);
      setMsg(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [error, msg]);
  const [syncToken, setSyncToken] = useState<string | null>(null);

  async function cargar(preferida?: string) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return router.push("/login");
    const [{ data: cs }, { data: rr }] = await Promise.all([
      supabase.from("trading_accounts").select("id, nombre, tipo, balance_inicial, numero_cuenta, broker, balance_actual, equity_actual, last_sync_at").order("created_at"),
      supabase.from("risk_rules").select("*").eq("owner_id", u.user.id).maybeSingle(),
    ]);
    const lista = ((cs ?? []) as Cuenta[]).map((c) => ({
      ...c,
      balance_inicial: Number(c.balance_inicial),
      balance_actual: c.balance_actual == null ? null : Number(c.balance_actual),
      equity_actual: c.equity_actual == null ? null : Number(c.equity_actual),
    }));
    setCuentas(lista);
    if (rr) {
      const r = rr as Record<string, unknown>;
      setReglas({ ...REGLAS_POR_DEFECTO, ...(Object.fromEntries(Object.entries(r).filter(([k]) => k in REGLAS_POR_DEFECTO).map(([k, v]) => [k, typeof v === "string" ? Number(v) : v])) as Partial<ReglasRiesgo>) });
      setGuardian({
        guard_symbol: String(r.guard_symbol ?? "XAUUSD"),
        guard_sl_pips: Number(r.guard_sl_pips ?? 60),
        guard_pip_size: Number(r.guard_pip_size ?? 0.1),
        guard_reward_ratio: Number(r.guard_reward_ratio ?? 2),
        guard_max_open: Number(r.guard_max_open ?? 1),
        guard_daily_loss_usd: r.guard_daily_loss_usd == null ? null : Number(r.guard_daily_loss_usd),
        guard_min_equity_usd: r.guard_min_equity_usd == null ? null : Number(r.guard_min_equity_usd),
        guard_lock_mode: r.guard_lock_mode === "total" || r.guard_lock_mode === "ninguno" ? r.guard_lock_mode : "flexible",
        guard_block_manual_close: r.guard_block_manual_close !== false,
      });
    }
    const id = preferida ?? cuentaId ?? lista[0]?.id ?? null;
    setCuentaId(id);
    if (id) {
      await cargarTrades(id);
      setBalanceEdit(lista.find((c) => c.id === id)?.balance_inicial ?? null);
    }
    setCargando(false);
  }

  async function cargarTrades(id: string) {
    const { data } = await supabase.from("trades").select("*").eq("account_id", id).order("hora_apertura", { ascending: false }).limit(3000);
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
    const { data: tk } = await supabase.from("trading_sync_tokens").select("token").eq("account_id", id).maybeSingle();
    setSyncToken(tk?.token ?? null);
    setMes("todo");
    setDiaSel(null);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // En vivo: si la cuenta está sincronizada con MT5, se refresca sola cada 30 s (sin perder el mes ni el día elegidos).
  useEffect(() => {
    if (!syncToken || !cuentaId) return;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const { data: c } = await supabase.from("trading_accounts").select("id, balance_actual, equity_actual, last_sync_at").eq("id", cuentaId).maybeSingle();
      if (c) {
        setCuentas((prev) =>
          prev.map((x) => (x.id === cuentaId ? { ...x, balance_actual: c.balance_actual == null ? null : Number(c.balance_actual), equity_actual: c.equity_actual == null ? null : Number(c.equity_actual), last_sync_at: c.last_sync_at } : x))
        );
      }
      const { data } = await supabase.from("trades").select("*").eq("account_id", cuentaId).order("hora_apertura", { ascending: false }).limit(3000);
      if (data) {
        setTrades(
          (data as FilaTrade[]).map((t) => ({
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
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncToken, cuentaId]);

  async function activarSync() {
    if (!cuenta) return;
    setError(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { error: e } = await supabase.from("trading_sync_tokens").upsert({ account_id: cuenta.id, owner_id: u.user.id, token, created_at: new Date().toISOString(), last_sync_at: null });
    if (e) return setError(`No se pudo activar la sincronización: ${e.message}`);
    setSyncToken(token);
    setMsg("Sincronización activada. Descarga el guardián otra vez para que lleve tu token.");
  }

  async function desactivarSync() {
    if (!cuenta) return;
    await supabase.from("trading_sync_tokens").delete().eq("account_id", cuenta.id);
    setSyncToken(null);
    setMsg("Sincronización desactivada. El guardián que ya tengas instalado dejará de enviar datos.");
  }

  async function crearCuenta() {
    setError(null);
    if (!nNombre.trim()) return setError("Ponle un nombre a la cuenta.");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error: e } = await supabase
      .from("trading_accounts")
      .insert({ owner_id: u.user.id, nombre: nNombre.trim(), tipo: nTipo, balance_inicial: nBalance ?? 0 })
      .select("id")
      .single();
    if (e || !data) return setError("No se pudo crear la cuenta.");
    setNNombre("");
    setNBalance(null);
    setMostrarNueva(false);
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
        if (e) return setError(`No se pudieron guardar los trades: ${e.message}`);
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

  async function guardarBalance() {
    if (!cuenta) return;
    const { error: e } = await supabase.from("trading_accounts").update({ balance_inicial: balanceEdit ?? 0 }).eq("id", cuenta.id);
    if (e) return setError("No se pudo guardar el balance.");
    setMsg("Balance guardado.");
    await cargar(cuenta.id);
  }

  async function guardarReglas() {
    setError(null);
    setMsg(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error: e } = await supabase.from("risk_rules").upsert({ owner_id: u.user.id, ...reglas, ...guardian, updated_at: new Date().toISOString() });
    if (e) return setError(`No se pudieron guardar las reglas: ${e.message}`);
    setMsg("Reglas guardadas.");
  }

  async function guardarNota(t: FilaTrade, nota: string, cumpli: boolean | null) {
    await supabase.from("trades").update({ nota: nota.trim() || null, cumpli_plan: cumpli }).eq("id", t.id);
    setTrades((prev) => prev.map((x) => (x.id === t.id ? { ...x, nota: nota.trim() || null, cumpli_plan: cumpli } : x)));
  }

  // Si la cuenta está sincronizada, el balance real viene de MT5; si no, lo escribe el usuario.
  const balanceInicial = cuenta?.balance_actual ?? cuenta?.balance_inicial ?? 0;

  // Todo se evalúa con el historial completo (la revancha o el límite diario dependen de trades anteriores).
  const evaluadosAll = useMemo(() => evaluarCumplimiento(trades as unknown as Trade[], reglas, balanceInicial), [trades, reglas, balanceInicial]);
  const filaPorTicket = useMemo(() => new Map(trades.map((t) => [t.ticket, t])), [trades]);
  const diasAll = useMemo(() => resultadosPorDia(evaluadosAll), [evaluadosAll]);
  const mesesDisp = useMemo(() => Array.from(new Set(evaluadosAll.map((t) => fechaCierre(t).slice(0, 7)))).sort(), [evaluadosAll]);

  useEffect(() => {
    if (!calMes && mesesDisp.length) setCalMes(mesesDisp[mesesDisp.length - 1]);
  }, [mesesDisp, calMes]);

  const evaluados = useMemo(() => (mes === "todo" ? evaluadosAll : evaluadosAll.filter((t) => fechaCierre(t).startsWith(mes))), [evaluadosAll, mes]);
  const balanceInicioPeriodo = useMemo(
    () => (mes === "todo" ? balanceInicial : balanceInicial + evaluadosAll.filter((t) => fechaCierre(t).slice(0, 7) < mes).reduce((s, t) => s + t.neto, 0)),
    [evaluadosAll, mes, balanceInicial]
  );
  const metricas = useMemo(() => calcularMetricas(evaluados, balanceInicioPeriodo), [evaluados, balanceInicioPeriodo]);
  const serie = useMemo(() => curvaCapital(evaluados, 0), [evaluados]);
  const impacto = useMemo(() => impactoReglas(evaluados), [evaluados]);
  // El reporte de posiciones no trae depósitos ni retiros, así que no se puede reconstruir el balance real:
  // el "capital" lo escribe el usuario (su balance de hoy) y se usa para calcular % de riesgo y lotes.
  const balanceActual = balanceInicial;

  function cambiarMesCal(delta: number) {
    if (!calMes) return;
    const [a, m] = calMes.split("-").map(Number);
    const d = new Date(Date.UTC(a, m - 1 + delta, 1));
    setCalMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    setDiaSel(null);
  }

  function elegirMes(m: string) {
    setMes(m);
    setDiaSel(null);
    if (m !== "todo") setCalMes(m);
  }

  // Calculadora de lote
  const infoCalc = infoSimbolo(cSimbolo);
  const contrato = cContrato ?? infoCalc?.contrato ?? 0;
  const pipSize = cPipSize ?? infoCalc?.pip ?? 0;
  const quote = infoCalc?.quote ?? "USD";
  const usdPorQuote = quote === "USD" ? 1 : cFx ?? USD_POR_MONEDA[quote] ?? 1;
  const distPrecio = (cPips ?? 0) * pipSize;
  const balanceCalc = cBalance ?? (balanceActual > 0 ? balanceActual : 0);
  const lote = contrato && pipSize
    ? calcularLote({ balance: balanceCalc, riesgoPct: reglas.riesgo_por_trade_pct, distanciaSL: distPrecio, contrato, usdPorQuote })
    : null;

  function descargarGuardian() {
    const codigo = generarGuardianMQ5({
      simbolo: guardian.guard_symbol,
      riesgoPct: reglas.riesgo_por_trade_pct,
      distanciaPips: guardian.guard_sl_pips,
      tamanoPip: guardian.guard_pip_size,
      relacionTP: guardian.guard_reward_ratio,
      maxPerdedoresDia: reglas.max_perdedores_dia,
      perdidaMaxDiaPct: reglas.perdida_max_dia_pct,
      perdidaMaxDiaUSD: guardian.guard_daily_loss_usd ?? 0,
      equityMinimoPct: 80,
      equityMinimoUSD: guardian.guard_min_equity_usd ?? 0,
      maxAbiertos: guardian.guard_max_open,
      maxTradesDia: reglas.max_trades_dia,
      esperaTrasPerdidaMin: reglas.espera_tras_perdida_min,
      syncUrl: syncToken ? `${window.location.origin}/api/trading/sync` : "",
      syncToken: syncToken ?? "",
      modoBloqueo: guardian.guard_lock_mode,
      bloquearCierreManual: guardian.guard_block_manual_close,
    });
    const url = URL.createObjectURL(new Blob([codigo], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "VictorGuard.mq5";
    a.click();
    URL.revokeObjectURL(url);
  }

  const campoRegla = (k: keyof ReglasRiesgo, etiqueta: string, ayuda?: string) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted">{etiqueta}</span>
      <NumInput value={reglas[k] as number} onChange={(n) => setReglas({ ...reglas, [k]: n ?? 0 })} />
      {ayuda && <span className="text-[10px] text-muted">{ayuda}</span>}
    </label>
  );

  const barraMeses = (
    <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
      {["todo", ...mesesDisp].map((m) => (
        <button
          key={m}
          onClick={() => elegirMes(m)}
          className={`whitespace-nowrap rounded-pill px-3 py-1 text-xs font-medium ${mes === m ? "bg-[#1B3A5C] text-white" : "border border-border text-muted"}`}
        >
          {m === "todo" ? "Todo" : nombreMes(m)}
        </button>
      ))}
    </div>
  );

  // Fila de trade (con nota) reutilizable
  const filaTrade = (t: TradeEvaluado) => {
    const f = filaPorTicket.get(t.ticket);
    return (
      <details key={t.ticket} className="px-3 py-2">
        <summary className="flex cursor-pointer items-center justify-between gap-2 text-xs">
          <span>
            <span className="font-medium">{t.simbolo}</span> {t.lado === "buy" ? "compra" : "venta"} {t.volumen}
            <span className="ml-2 text-muted">{horaCorta(t.hora_apertura)}</span>
            {t.violaciones.length > 0 && <span className="ml-2 text-red">⚠ {t.violaciones.length}</span>}
          </span>
          <span className={t.neto >= 0 ? "text-teal" : "text-red"}>{formatMoney(t.neto)}</span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 text-[11px] text-muted">
          <p>Duración {dur(t.duracionSeg)} · SL {t.sl ?? "no puso"} · TP {t.tp ?? "no puso"} · hora del broker</p>
          {t.violaciones.map((v) => (
            <p key={v} className="text-red">• {NOMBRE_REGLA[v]}</p>
          ))}
          {f && <NotaTrade t={f} onGuardar={guardarNota} />}
        </div>
      </details>
    );
  };

  if (cargando) return <div className="vc-shell"><p className="text-xs text-muted">Cargando...</p></div>;

  const tradesDia = diaSel ? evaluadosAll.filter((t) => fechaCierre(t) === diaSel).sort((a, b) => (a.hora_apertura < b.hora_apertura ? -1 : 1)) : [];

  // Bitácora agrupada por día
  const gruposDia = (() => {
    const base = evaluados.filter((t) => !soloRotas || t.violaciones.length > 0);
    const m = new Map<string, TradeEvaluado[]>();
    for (const t of base) {
      const k = fechaCierre(t);
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  })();

  const kpis: [string, string, number | null][] = [
    ["Resultado", formatMoney(metricas.neto), null],
    ["Aciertos", `${metricas.winRate.toFixed(0)}%`, metricas.winRate],
    ["Ganado / perdido", `${formatMoney(metricas.promedioGanado, 0)} / ${formatMoney(Math.abs(metricas.promedioPerdido), 0)}`, null],
    ["Factor de beneficio", metricas.profitFactor === null ? "—" : metricas.profitFactor.toFixed(2), null],
    ["Caída máxima", `${formatMoney(metricas.caidaMaxima, 0)} (${metricas.caidaMaximaPct.toFixed(0)}%)`, null],
    ["Disciplina", `${metricas.disciplina.toFixed(0)}%`, metricas.disciplina],
    ["Trades", String(metricas.trades), null],
    ["Peor racha perdedora", String(metricas.rachaPerdedoraMax), null],
  ];

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Mi negocio de trading</h1>
        <button onClick={() => router.push("/dashboard")} className="vc-btn-back">Volver</button>
      </div>

      <p className="mb-4 text-[11px] text-muted">
        Esta herramienta organiza tus operaciones y mide si cumples tus propias reglas. No da señales, recomendaciones ni asesoría financiera, fiscal o legal.
      </p>

      <datalist id="vt-simbolos">
        {Object.keys(SIMBOLOS).map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>

      {(error || msg) && (
        <div
          role="status"
          onClick={() => {
            setError(null);
            setMsg(null);
          }}
          className="fixed bottom-20 left-1/2 z-50 w-[92%] max-w-md -translate-x-1/2 cursor-pointer rounded-lg px-4 py-3 text-sm text-white shadow-lg"
          style={{ background: error ? "#d64545" : "#1f9d74" }}
        >
          {error ?? msg}
        </div>
      )}

      {cuentas.length === 0 || mostrarNueva ? (
        <div className="vc-card flex flex-col gap-3">
          <p className="text-sm font-medium">{cuentas.length === 0 ? "Crea tu primera cuenta" : "Nueva cuenta"}</p>
          <input className="vc-input" placeholder="Nombre (ej. Axi real)" value={nNombre} onChange={(e) => setNNombre(e.target.value)} maxLength={80} />
          <div className="flex gap-2">
            <select className="vc-input" value={nTipo} onChange={(e) => setNTipo(e.target.value as "demo" | "real")}>
              <option value="demo">Demo</option>
              <option value="real">Real</option>
            </select>
            <NumInput value={nBalance} onChange={setNBalance} placeholder="Balance inicial $" />
          </div>
          <button className="vc-btn-primary" onClick={crearCuenta}>Crear cuenta</button>
          {cuentas.length > 0 && (
            <button className="text-xs text-muted" onClick={() => setMostrarNueva(false)}>Cancelar</button>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <select
              className="vc-input"
              value={cuentaId ?? ""}
              onChange={async (e) => {
                setCuentaId(e.target.value);
                setBalanceEdit(cuentas.find((c) => c.id === e.target.value)?.balance_inicial ?? null);
                await cargarTrades(e.target.value);
              }}
            >
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>
              ))}
            </select>
            <button className="rounded-lg border border-border px-3 text-xs whitespace-nowrap" onClick={() => setMostrarNueva(true)}>+ Cuenta</button>
            <label className="vc-btn-primary cursor-pointer whitespace-nowrap text-center">
              Subir reporte
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && subirReporte(e.target.files[0])} />
            </label>
          </div>

          {syncToken && (
            <div className="vc-card mb-3 flex flex-wrap items-center justify-between gap-2 !p-3 text-xs">
              {(() => {
                const ult = cuenta?.last_sync_at ? new Date(cuenta.last_sync_at).getTime() : 0;
                const min = ult ? Math.round((Date.now() - ult) / 60000) : null;
                const vivo = min !== null && min <= 3;
                return (
                  <>
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: vivo ? "#1f9d74" : "#e0a31a" }} />
                      {min === null ? "Esperando la primera señal de MT5" : vivo ? "En vivo desde MT5" : `Sin señal hace ${min} min (¿MT5 cerrado?)`}
                    </span>
                    {cuenta?.balance_actual != null && (
                      <span className="text-muted">
                        Balance <b className="text-[inherit]">{formatMoney(cuenta.balance_actual)}</b>
                        {cuenta.equity_actual != null && <> · Equity <b className="text-[inherit]">{formatMoney(cuenta.equity_actual)}</b></>}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          <div className="mb-4 flex gap-2">
            {([["panel", "Panel"], ["bitacora", "Bitácora"], ["riesgo", "Riesgo"]] as const).map(([t, nombre]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-pill px-3 py-1 text-xs font-medium ${tab === t ? "bg-[#1B3A5C] text-white" : "border border-border text-muted"}`}
              >
                {nombre}
              </button>
            ))}
          </div>

          {tab !== "riesgo" && trades.length > 0 && barraMeses}

          {/* ---------------- PANEL ---------------- */}
          {tab === "panel" && (
            <>
              {trades.length === 0 ? (
                <div className="vc-card text-center text-xs text-muted">Sube el reporte Excel de MT5 para ver tu panel.</div>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {kpis.map(([k, v, anillo]) => (
                      <div key={k} className="vc-card flex items-center justify-between !p-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted">{k}</p>
                          <p className={`text-sm font-medium ${k === "Resultado" ? (metricas.neto >= 0 ? "text-teal" : "text-red") : ""}`}>{v}</p>
                        </div>
                        {anillo !== null && <Anillo valor={anillo} color={k === "Disciplina" && anillo < 50 ? "#d64545" : undefined} />}
                      </div>
                    ))}
                  </div>

                  <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                      {calMes && <Calendario ym={calMes} onCambiarMes={cambiarMesCal} dias={diasAll} diaSel={diaSel} onDia={setDiaSel} />}
                    </div>
                    <div className="vc-card !p-3">
                      <p className="mb-2 text-xs uppercase tracking-wide text-muted">Cumplimiento de tus reglas</p>
                      <p className={`text-2xl font-medium ${metricas.disciplina >= 60 ? "text-teal" : "text-red"}`}>{metricas.disciplina.toFixed(0)}%</p>
                      <p className="mb-2 text-[11px] text-muted">de tus trades cumplieron todas tus reglas</p>
                      {(Object.keys(NOMBRE_REGLA) as (keyof typeof NOMBRE_REGLA)[])
                        .filter((r) => metricas.reglasRotas[r] > 0)
                        .sort((a, b) => metricas.reglasRotas[b] - metricas.reglasRotas[a])
                        .slice(0, 3)
                        .map((r) => (
                          <p key={r} className="flex justify-between text-xs">
                            <span>{NOMBRE_REGLA[r]}</span>
                            <span className="text-red">{metricas.reglasRotas[r]}</span>
                          </p>
                        ))}
                      <button className="mt-3 text-xs font-medium text-teal" onClick={() => setTab("riesgo")}>Ver cuánto te costó →</button>
                    </div>
                  </div>

                  {diaSel && (
                    <div className="vc-card mb-4 !p-0">
                      <p className="border-b border-border px-3 py-2 text-xs font-medium">
                        {nombreDia(diaSel)} · {tradesDia.length} trades ·{" "}
                        <span className={diasAll[diaSel]?.neto >= 0 ? "text-teal" : "text-red"}>{formatMoney(diasAll[diaSel]?.neto ?? 0)}</span>
                      </p>
                      <div className="divide-y divide-border">{tradesDia.map(filaTrade)}</div>
                    </div>
                  )}

                  <div className="mb-4">
                    <CurvaCapital serie={serie} />
                  </div>

                  <div className="vc-card !p-0">
                    <p className="border-b border-border px-3 py-2 text-xs uppercase tracking-wide text-muted">Trades recientes</p>
                    <div className="divide-y divide-border">
                      {[...evaluados]
                        .sort((a, b) => ((b.hora_cierre ?? b.hora_apertura) > (a.hora_cierre ?? a.hora_apertura) ? 1 : -1))
                        .slice(0, 8)
                        .map((t) => (
                          <div key={t.ticket} className="flex items-center justify-between gap-2 px-3 py-2 text-xs" style={{ borderLeft: `3px solid ${t.neto >= 0 ? "#1f9d74" : "#d64545"}` }}>
                            <span>
                              <span className="font-medium">{t.simbolo}</span> {t.lado === "buy" ? "compra" : "venta"} {t.volumen}
                              <span className="ml-2 text-muted">{fechaCorta(t.hora_apertura)} {horaCorta(t.hora_apertura)}</span>
                              {t.violaciones.length > 0 && <span className="ml-2 text-red">⚠ {t.violaciones.length}</span>}
                            </span>
                            <span className={t.neto >= 0 ? "text-teal" : "text-red"}>{formatMoney(t.neto)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ---------------- BITÁCORA ---------------- */}
          {tab === "bitacora" && (
            <>
              <label className="mb-3 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={soloRotas} onChange={(e) => setSoloRotas(e.target.checked)} />
                Ver solo trades donde rompí alguna regla
              </label>
              {gruposDia.length === 0 ? (
                <div className="vc-card text-center text-xs text-muted">
                  {trades.length === 0 ? "Sube el reporte Excel de MT5 para ver tus trades." : "Ningún trade con esos filtros."}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {gruposDia.map(([f, lista]) => {
                    const tot = lista.reduce((s, t) => s + t.neto, 0);
                    const gan = lista.filter((t) => t.neto > 0).length;
                    const rotas = lista.reduce((s, t) => s + t.violaciones.length, 0);
                    return (
                      <details key={f} className="vc-card !p-0">
                        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-xs" style={{ borderLeft: `3px solid ${tot >= 0 ? "#1f9d74" : "#d64545"}` }}>
                          <span>
                            <span className="font-medium capitalize">{nombreDia(f)}</span>
                            <span className="ml-2 text-muted">
                              {lista.length} trades · {gan} ganados
                              {rotas > 0 && <span className="text-red"> · ⚠ {rotas}</span>}
                            </span>
                          </span>
                          <span className={`font-medium ${tot >= 0 ? "text-teal" : "text-red"}`}>{formatMoney(tot)}</span>
                        </summary>
                        <div className="divide-y divide-border border-t border-border">
                          {[...lista].sort((a, b) => (a.hora_apertura < b.hora_apertura ? -1 : 1)).map(filaTrade)}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ---------------- RIESGO ---------------- */}
          {tab === "riesgo" && (
            <>
              <div className="mb-4 rounded-lg p-3.5 text-sm text-white" style={{ background: "#1B3A5C" }}>
                <p className="font-medium">Cómo te ayuda el manejo de riesgo</p>
                <ol className="mt-2 list-decimal pl-4 text-xs text-white/85">
                  <li className="mb-1">Defines tus reglas: cuánto arriesgas por trade, cuántas pérdidas aguantas al día y cuánto esperas después de perder.</li>
                  <li className="mb-1">La app revisa tu historial y te muestra qué trades las rompieron y cuánto te costó (abajo).</li>
                  <li>Descargas el guardián para MT5: pone el lote, el stop y el límite por ti y te bloquea cuando llegas a tu tope. Así no dependes de tu fuerza de voluntad en el momento.</li>
                </ol>
              </div>

              {metricas.trades > 0 && (
                <div className="vc-card mb-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted">Lo que te costó romper tus reglas{mes !== "todo" ? ` · ${nombreMes(mes)}` : ""}</p>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg p-3" style={{ background: "rgba(31,157,116,0.12)" }}>
                      <p className="text-[10px] uppercase text-muted">Cumpliste ({impacto.limpios.n})</p>
                      <p className={`text-base font-medium ${impacto.limpios.neto >= 0 ? "text-teal" : "text-red"}`}>{formatMoney(impacto.limpios.neto)}</p>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: "rgba(214,69,69,0.12)" }}>
                      <p className="text-[10px] uppercase text-muted">Rompiste reglas ({impacto.rotos.n})</p>
                      <p className={`text-base font-medium ${impacto.rotos.neto >= 0 ? "text-teal" : "text-red"}`}>{formatMoney(impacto.rotos.neto)}</p>
                    </div>
                  </div>
                  {mesesDisp.length > 1 && (
                    <div className="mt-3">
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Disciplina por mes</p>
                      {mesesDisp.map((m) => {
                        const l = evaluadosAll.filter((t) => fechaCierre(t).startsWith(m));
                        const pct = l.length ? (l.filter((t) => t.violaciones.length === 0).length / l.length) * 100 : 0;
                        return (
                          <div key={m} className="mb-1 flex items-center gap-2 text-[11px]">
                            <span className="w-16 text-muted">{nombreMes(m)}</span>
                            <div className="h-2 flex-1 rounded-full bg-border">
                              <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: pct >= 60 ? "#1f9d74" : pct >= 35 ? "#e0a31a" : "#d64545" }} />
                            </div>
                            <span className="w-8 text-right">{pct.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="vc-card mb-4 flex flex-col gap-3">
                <p className="text-xs uppercase tracking-wide text-muted">Mi cuenta</p>
                {cuenta?.balance_actual != null ? (
                  <p className="text-sm">
                    Balance en vivo desde MT5: <span className="font-medium">{formatMoney(cuenta.balance_actual)}</span>
                    <span className="block text-[10px] text-muted">Se actualiza solo mientras el guardián esté corriendo en MT5. Se usa para el riesgo por trade, el lote y los límites.</span>
                  </p>
                ) : (
                <div className="flex items-end gap-2">
                  <label className="flex flex-1 flex-col gap-1 text-xs">
                    <span className="text-muted">Balance de tu cuenta hoy ($)</span>
                    <NumInput value={balanceEdit} onChange={setBalanceEdit} />
                  </label>
                  <button className="rounded-lg border border-border px-3 py-2 text-xs" onClick={guardarBalance}>Guardar</button>
                </div>
                )}
                <p className="text-[10px] text-muted">Se usa para calcular tu riesgo por trade, el lote y los límites del guardián. El reporte no incluye depósitos ni retiros, por eso no lo calculo solo: actualízalo cuando cambie.</p>
              </div>

              <div className="vc-card mb-4 flex flex-col gap-3">
                <p className="text-xs uppercase tracking-wide text-muted">Mis reglas de riesgo</p>
                <div className="grid grid-cols-2 gap-3">
                  {campoRegla("riesgo_por_trade_pct", "Riesgo por trade (% del balance)")}
                  {campoRegla("perdida_max_dia_pct", "Pérdida máxima del día (%)")}
                  {campoRegla("max_perdedores_dia", "Máx. trades perdedores al día")}
                  {campoRegla("max_trades_dia", "Máx. trades al día")}
                  {campoRegla("espera_tras_perdida_min", "Espera tras una pérdida (min)", "0 = sin espera")}
                  {campoRegla("duracion_min_seg", "Duración mínima del trade (seg)", "Solo para medir; el guardián no la fuerza")}
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={reglas.sl_obligatorio} onChange={(e) => setReglas({ ...reglas, sl_obligatorio: e.target.checked })} />
                  Stop loss obligatorio
                </label>
                <p className="text-[10px] text-muted">Los valores iniciales son solo un punto de partida educativo. Son tus reglas: ajústalas a tu plan.</p>
              </div>

              <div className="vc-card mb-4 flex flex-col gap-3">
                <p className="text-xs uppercase tracking-wide text-muted">Guardián para MT5</p>
                <p className="text-[11px] text-muted">
                  Un programa (EA) que pones en tu gráfico de MT5. No decide cuándo entrar: tú entras con sus botones COMPRAR / VENDER y él calcula el lote, pone stop y take profit, y te bloquea al llegar a tus límites.
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="flex flex-col gap-1"><span className="text-muted">Símbolo permitido</span>
                    <input
                      className="vc-input"
                      list="vt-simbolos"
                      value={guardian.guard_symbol}
                      onChange={(e) => {
                        const v = e.target.value.toUpperCase();
                        const inf = infoSimbolo(v);
                        setGuardian({ ...guardian, guard_symbol: v, ...(inf ? { guard_pip_size: inf.pip } : {}) });
                      }}
                    />
                    <span className="text-[10px] text-muted">Como aparece en tu broker (ej. EURUSD, NAS100.fs, US30). Sirve para cualquier símbolo.</span>
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-muted">Distancia del stop (pips)</span>
                    <NumInput value={guardian.guard_sl_pips} onChange={(n) => setGuardian({ ...guardian, guard_sl_pips: n ?? 0 })} />
                    <span className="text-[10px] text-muted">Oro: 60 pips = $6 de precio</span>
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-muted">Tamaño de 1 pip (precio)</span>
                    <NumInput value={guardian.guard_pip_size} onChange={(n) => setGuardian({ ...guardian, guard_pip_size: n ?? 0 })} />
                    <span className="text-[10px] text-muted">Se llena solo para símbolos conocidos</span>
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-muted">Take profit = stop ×</span>
                    <NumInput value={guardian.guard_reward_ratio} onChange={(n) => setGuardian({ ...guardian, guard_reward_ratio: n ?? 0 })} />
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-muted">Trades abiertos a la vez</span>
                    <NumInput value={guardian.guard_max_open} onChange={(n) => setGuardian({ ...guardian, guard_max_open: n ?? 1 })} />
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-muted">Pérdida máxima del día en $ (opcional)</span>
                    <NumInput value={guardian.guard_daily_loss_usd} onChange={(n) => setGuardian({ ...guardian, guard_daily_loss_usd: n })} placeholder="Automática" />
                    <span className="text-[10px] text-muted">Vacío = {reglas.perdida_max_dia_pct}% del balance que tenga MT5 al empezar el día</span>
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-muted">Equity mínimo en $ (opcional)</span>
                    <NumInput value={guardian.guard_min_equity_usd} onChange={(n) => setGuardian({ ...guardian, guard_min_equity_usd: n })} placeholder="Automático" />
                    <span className="text-[10px] text-muted">Vacío = 80% del balance de MT5 al empezar el día. Si baja de ahí, se bloquea todo</span>
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted">Qué puedo hacer con el stop y el take profit</span>
                  <select className="vc-input" value={guardian.guard_lock_mode} onChange={(e) => setGuardian({ ...guardian, guard_lock_mode: e.target.value as Guardian["guard_lock_mode"] })}>
                    <option value="flexible">Flexible: el stop siempre puesto; lo muevo solo a mi favor y el TP libre</option>
                    <option value="total">Estricto: no puedo mover ninguno</option>
                    <option value="ninguno">Sin bloqueo: solo pone el stop al abrir</option>
                  </select>
                  <span className="text-[10px] text-muted">
                    Flexible deja proteger la ganancia y perseguir el precio (subir el stop, ampliar el TP), pero nunca alejar el stop ni quitarlo. Con take profit en 0 el guardián no pone TP al abrir.
                  </span>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={guardian.guard_block_manual_close} onChange={(e) => setGuardian({ ...guardian, guard_block_manual_close: e.target.checked })} />
                  Si cierro un trade a mano, bloquear el resto del día
                </label>
                <div className="flex gap-2">
                  <button className="vc-btn-primary" onClick={guardarReglas}>Guardar reglas</button>
                  <button className="rounded-lg border border-[#1B3A5C] px-4 text-sm font-medium text-[#1B3A5C]" onClick={descargarGuardian}>Descargar para MT5</button>
                </div>
                <div className="rounded-lg border border-border p-3 text-xs">
                  <p className="mb-1 font-medium">Sincronización en vivo</p>
                  {syncToken ? (
                    <>
                      <p className="text-muted">
                        Activa para <b>{cuenta?.nombre}</b>. El guardián envía tus trades cerrados y tu balance cada 30 segundos, y este panel se actualiza solo. Si cambiaste algo, <b>descarga el guardián otra vez</b> y reemplázalo en MT5 (lleva tu token adentro).
                      </p>
                      <div className="mt-2 flex gap-3">
                        <button className="text-teal" onClick={activarSync}>Generar token nuevo</button>
                        <button className="text-red" onClick={desactivarSync}>Desactivar</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-muted">Sin subir reportes: el guardián manda tus trades y tu balance a este panel mientras MT5 esté abierto.</p>
                      <button className="mt-2 rounded-lg border border-[#1B3A5C] px-3 py-1.5 font-medium text-[#1B3A5C]" onClick={activarSync}>Activar sincronización</button>
                    </>
                  )}
                  {syncToken && (
                    <p className="mt-2 text-[10px] text-muted">
                      Una sola vez en MT5: <b>Herramientas → Opciones → Asesores Expertos</b>, marca <b>Permitir WebRequest para las URL listadas</b> y agrega <b>{typeof window !== "undefined" ? window.location.origin : ""}</b>.
                    </p>
                  )}
                </div>
                <details className="text-[11px] text-muted">
                  <summary className="cursor-pointer text-xs font-medium text-teal">Cómo instalarlo en MT5</summary>
                  <ol className="mt-2 list-decimal pl-4">
                    <li>En MT5 abre <b>Archivo → Abrir carpeta de datos</b> y entra a <b>MQL5 → Experts</b>.</li>
                    <li>Copia ahí el archivo <b>VictorGuard.mq5</b> descargado.</li>
                    <li>Abre MetaEditor (F4), abre el archivo y pulsa <b>Compilar (F7)</b>. Debe decir 0 errores.</li>
                    <li>En MT5, arrastra <b>VictorGuard</b> desde el Navegador a un gráfico del símbolo permitido y activa <b>Algo Trading</b> (botón verde).</li>
                    <li>Los valores se pueden ajustar en la pestaña <b>Entradas</b> sin volver a la app. Pruébalo primero en cuenta demo.</li>
                  </ol>
                </details>
                <p className="text-[10px] text-muted">Para MT4 el programa es distinto y todavía no está disponible. Es una herramienta de control propio, no una señal ni una garantía de resultados.</p>
              </div>

              <div className="vc-card mb-4 flex flex-col gap-3">
                <p className="text-xs uppercase tracking-wide text-muted">Calculadora de lote</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="flex flex-col gap-1"><span className="text-muted">Balance $</span>
                    <NumInput value={cBalance} onChange={setCBalance} placeholder={balanceCalc.toFixed(2)} />
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-muted">Símbolo</span>
                    <input className="vc-input" list="vt-simbolos" value={cSimbolo} onChange={(e) => setCSimbolo(e.target.value.toUpperCase())} />
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-muted">Distancia al stop (pips)</span>
                    <NumInput value={cPips} onChange={setCPips} />
                  </label>
                  {!infoCalc && (
                    <>
                      <label className="flex flex-col gap-1"><span className="text-muted">Unidades por lote</span>
                        <NumInput value={cContrato} onChange={setCContrato} placeholder="Lo da tu broker" />
                      </label>
                      <label className="flex flex-col gap-1"><span className="text-muted">Tamaño de 1 pip (precio)</span>
                        <NumInput value={cPipSize} onChange={setCPipSize} placeholder="ej. 0.0001" />
                      </label>
                    </>
                  )}
                  {infoCalc && quote !== "USD" && (
                    <label className="flex flex-col gap-1"><span className="text-muted">1 {quote} = ? USD (aprox.)</span>
                      <NumInput value={usdPorQuote} onChange={setCFx} />
                    </label>
                  )}
                </div>
                {infoCalc && (
                  <p className="text-[10px] text-muted">
                    1 pip = {pipSize} de precio · stop = {distPrecio.toFixed(5).replace(/0+$/, "").replace(/\.$/, "")} de precio. Si tu broker cuenta los pips distinto, ajusta el tamaño en el guardián.
                  </p>
                )}
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
                <p className="mb-2 text-xs uppercase tracking-wide text-muted">Reglas rotas{mes !== "todo" ? ` · ${nombreMes(mes)}` : ""}</p>
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
