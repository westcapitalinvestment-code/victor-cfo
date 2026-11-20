"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  aHoraPR,
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
import { generarGuardianMQ5, type ModoStop, type TemporalidadATR } from "@/lib/trading-guard";
import { Anillo, BarrasMensuales, Calendario, CurvaCapital, nombreMes, type MesPct } from "./graficos";
import Estadisticas from "./estadisticas";
import ReglasPropias, { type ReglaPropia } from "./reglas-propias";

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
  riesgo_usd?: number | null;
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
  timeframe?: string | null;
  setup?: string | null;
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
  guard_sl_mode: ModoStop;
  guard_sl_pct: number;
  guard_atr_mult: number;
  guard_atr_tf: TemporalidadATR;
  guard_blocked_symbols: string;
  guard_pip_symbol: string;
};
const TFS_ATR: TemporalidadATR[] = ["M5", "M15", "M30", "H1", "H4", "D1"];
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
  guard_sl_mode: "atr",
  guard_sl_pct: 0.5,
  guard_atr_mult: 1.5,
  guard_atr_tf: "M15",
  guard_blocked_symbols: "",
  guard_pip_symbol: "XAUUSD",
};

// Se muestra en hora de Puerto Rico (los datos guardados siguen en hora del broker).
const fechaCorta = (s: string) => { const p = aHoraPR(s); return `${p.slice(5, 7)}/${p.slice(8, 10)}`; };
const horaCorta = (s: string) => aHoraPR(s).slice(11, 16);
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

// Candado (19 nov 2026): Trading viene en Core + Trading, Pro y Business. Si el
// plan no lo incluye se muestra la oferta en vez del módulo.
export default function TradingPage() {
  const [acceso, setAcceso] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/config/trading")
      .then((r) => r.json())
      .then((r) => setAcceso(!!r?.acceso))
      .catch(() => setAcceso(false));
  }, []);
  if (acceso === null) return <div className="vc-shell text-sm text-muted">Cargando…</div>;
  if (!acceso) {
    return (
      <div className="vc-shell">
        <div className="vc-card mx-auto max-w-xl text-center">
          <i className="ti ti-chart-candle text-3xl text-teal" />
          <h1 className="mt-2 text-xl font-semibold">Trading con reglas que se cumplen solas</h1>
          <p className="mt-2 text-sm text-muted">
            Guardián para MT5 que calcula el lote de cada activo, pone tu stop y te bloquea al llegar a tu límite del día. Bitácora automática y % ganado por día, mes
            y año.
          </p>
          <p className="mt-3 text-sm">
            Viene en <b>Core + Trading</b> ($19.99/mes) y está incluido en <b>Pro</b> y <b>Business</b>.
          </p>
          <a href="/dashboard/config#trading" className="vc-btn-primary mt-4 inline-block">
            Activar Trading
          </a>
        </div>
      </div>
    );
  }
  return <TradingContenido />;
}

function TradingContenido() {
  const router = useRouter();
  const supabase = createClient();
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<"panel" | "bitacora" | "estadisticas" | "riesgo">("panel");
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
  // Mi checklist: reglas propias y sus marcas por trade (trade_id → regla_id → cumplida).
  const [reglasPropias, setReglasPropias] = useState<ReglaPropia[]>([]);
  const [checks, setChecks] = useState<Map<string, Record<string, boolean>>>(new Map());

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
    const { data: rp } = await supabase.from("trading_reglas_propias").select("id, texto, orden").order("orden");
    setReglasPropias((rp ?? []) as ReglaPropia[]);
    const mapa = new Map<string, Record<string, boolean>>();
    for (let desde = 0; ; desde += 1000) {
      const { data: ck } = await supabase.from("trade_checks").select("trade_id, regla_id, cumplida").range(desde, desde + 999);
      for (const c of (ck ?? []) as { trade_id: string; regla_id: string; cumplida: boolean }[]) {
        mapa.set(c.trade_id, { ...(mapa.get(c.trade_id) ?? {}), [c.regla_id]: c.cumplida });
      }
      if (!ck || ck.length < 1000) break;
    }
    setChecks(mapa);
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
        guard_sl_mode: r.guard_sl_mode === "porcentaje" || r.guard_sl_mode === "atr" ? r.guard_sl_mode : "pips",
        guard_sl_pct: Number(r.guard_sl_pct ?? 0.5),
        guard_atr_mult: Number(r.guard_atr_mult ?? 1.5),
        guard_atr_tf: TFS_ATR.includes(r.guard_atr_tf as TemporalidadATR) ? (r.guard_atr_tf as TemporalidadATR) : "H1",
        guard_blocked_symbols: String(r.guard_blocked_symbols ?? ""),
        guard_pip_symbol: String(r.guard_pip_symbol ?? "XAUUSD"),
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
        riesgo_usd: t.riesgo_usd == null ? null : Number(t.riesgo_usd),
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
        riesgo_usd: t.riesgo_usd == null ? null : Number(t.riesgo_usd),
          }))
        );
      }
    }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncToken, cuentaId]);

  async function activarSync(silencioso = false): Promise<string | null> {
    if (!cuenta) return null;
    setError(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { error: e } = await supabase.from("trading_sync_tokens").upsert({ account_id: cuenta.id, owner_id: u.user.id, token, created_at: new Date().toISOString(), last_sync_at: null });
    if (e) {
      setError(`No se pudo activar la sincronización: ${e.message}`);
      return null;
    }
    setSyncToken(token);
    if (!silencioso) setMsg("Sincronización activada. Descarga el guardián otra vez para que lleve tu token.");
    return token;
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

  // Devuelve un texto de error si falló (null = guardado), para que la tarjeta lo muestre.
  async function guardarNota(
    t: FilaTrade,
    nota: string,
    cumpli: boolean | null,
    tf: string | null,
    setup: string | null,
    marcas: Record<string, boolean>
  ): Promise<string | null> {
    const cambios = { nota: nota.trim() || null, cumpli_plan: cumpli, timeframe: tf || null, setup: setup?.trim().slice(0, 60) || null };
    const { error: e } = await supabase.from("trades").update(cambios).eq("id", t.id);
    if (e) return e.message;
    setTrades((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...cambios } : x)));
    // Marcas del checklist: se reemplazan todas las de este trade.
    const { data: u } = await supabase.auth.getUser();
    const { error: e2 } = await supabase.from("trade_checks").delete().eq("trade_id", t.id);
    if (e2) return e2.message;
    const filas = Object.entries(marcas).map(([regla_id, cumplida]) => ({ trade_id: t.id, regla_id, cumplida, owner_id: u.user?.id }));
    if (filas.length) {
      const { error: e3 } = await supabase.from("trade_checks").insert(filas);
      if (e3) return e3.message;
    }
    setChecks((prev) => {
      const m = new Map(prev);
      if (filas.length) m.set(t.id, { ...marcas });
      else m.delete(t.id);
      return m;
    });
    return null;
  }

  // Si la cuenta está sincronizada, el balance real viene de MT5; si no, lo escribe el usuario.
  const balanceInicial = cuenta?.balance_actual ?? cuenta?.balance_inicial ?? 0;

  // Todo se evalúa con el historial completo (la revancha o el límite diario dependen de trades anteriores).
  // Modo simple: lo que puedo perder al día / pérdidas que aguanto al día = $ fijos por trade, en cualquier activo.
  // El total de trades del día es aparte: si vas ganando, sigues con el mismo riesgo hasta ese máximo.
  const riesgoFijoUSD =
    guardian.guard_daily_loss_usd && guardian.guard_daily_loss_usd > 0 && reglas.max_perdedores_dia > 0
      ? Math.floor((guardian.guard_daily_loss_usd / reglas.max_perdedores_dia) * 100) / 100
      : 0;
  const evaluadosAll = useMemo(
    () => evaluarCumplimiento(trades as unknown as Trade[], reglas, balanceInicial, riesgoFijoUSD),
    [trades, reglas, balanceInicial, riesgoFijoUSD]
  );
  const filaPorTicket = useMemo(() => new Map(trades.map((t) => [t.ticket, t])), [trades]);
  const etiquetas = useMemo(
    () => new Map(trades.map((t) => [t.ticket, { tf: t.timeframe ?? null, setup: t.setup ?? null, checks: checks.get(t.id) ?? {} }])),
    [trades, checks]
  );
  const setupsUsados = useMemo(() => Array.from(new Set(trades.map((t) => t.setup).filter((x): x is string => !!x))).sort(), [trades]);
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
  // % ganado/perdido: el balance de hoy menos todo lo ganado da el capital con que empezó la cuenta;
  // cada mes se mide contra el balance que había al empezar ese mes.
  const capitalInicio = useMemo(() => balanceInicial - evaluadosAll.reduce((s, t) => s + t.neto, 0), [balanceInicial, evaluadosAll]);
  const pctMeses = useMemo<MesPct[]>(() => {
    let acumulado = capitalInicio;
    return mesesDisp.map((ym) => {
      const neto = evaluadosAll.filter((t) => fechaCierre(t).startsWith(ym)).reduce((s, t) => s + t.neto, 0);
      const inicio = acumulado;
      acumulado += neto;
      return { ym, neto, inicio, pct: inicio > 0 ? (neto / inicio) * 100 : null };
    });
  }, [mesesDisp, evaluadosAll, capitalInicio]);
  const netoTotal = balanceInicial - capitalInicio;
  const pctTotal = capitalInicio > 0 ? (netoTotal / capitalInicio) * 100 : null;
  // Rendimiento contra el balance con que empezó el día, el mes y el año (fecha de cierre del broker).
  const rendimientos = useMemo(() => {
    const d = new Date();
    const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const desde = (inicioStr: string) => {
      let antes = 0, neto = 0;
      for (const t of evaluadosAll) {
        if (fechaCierre(t) < inicioStr) antes += t.neto;
        else neto += t.neto;
      }
      const inicio = capitalInicio + antes;
      return { inicio, neto, pct: inicio > 0 ? (neto / inicio) * 100 : null };
    };
    return [
      { k: "Hoy", ...desde(hoy) },
      { k: "Este mes", ...desde(`${hoy.slice(0, 7)}-01`) },
      { k: "Este año", ...desde(`${hoy.slice(0, 4)}-01-01`) },
      { k: "Total", ...desde("0000-00-00") },
    ];
  }, [evaluadosAll, capitalInicio]);
  const pctDia = useMemo(() => {
    const out: Record<string, number> = {};
    let saldo = capitalInicio;
    for (const f of Object.keys(diasAll).sort()) {
      if (saldo > 0) out[f] = (diasAll[f].neto / saldo) * 100;
      saldo += diasAll[f].neto;
    }
    return out;
  }, [diasAll, capitalInicio]);
  // Uso de hoy de cada límite (como el panel de una cuenta de fondeo).
  const usoHoy = useMemo(() => {
    const d = new Date();
    const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const tHoy = evaluadosAll.filter((t) => fechaCierre(t) === hoy);
    const neto = tHoy.reduce((s, t) => s + t.neto, 0);
    return { trades: tHoy.length, perdedores: tHoy.filter((t) => t.neto < 0).length, perdido: Math.max(0, -neto) };
  }, [evaluadosAll]);
  const limitePerdidaDia = guardian.guard_daily_loss_usd && guardian.guard_daily_loss_usd > 0 ? guardian.guard_daily_loss_usd : (balanceInicial * reglas.perdida_max_dia_pct) / 100;
  const basePeriodo = mes === "todo" ? capitalInicio : pctMeses.find((m) => m.ym === mes)?.inicio ?? 0;
  const pctPeriodo = basePeriodo > 0 ? (metricas.neto / basePeriodo) * 100 : null;
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

  const todosActivos = guardian.guard_symbol.trim() === "" || guardian.guard_symbol.includes("*");

  async function descargarGuardian() {
    // El guardián siempre sale con la sincronización lista: si no hay token, se crea uno.
    const token = syncToken ?? (await activarSync(true));
    const codigo = generarGuardianMQ5({
      simbolos: guardian.guard_symbol,
      modoStop: guardian.guard_sl_mode,
      stopPct: guardian.guard_sl_pct,
      atrMult: guardian.guard_atr_mult,
      atrTF: guardian.guard_atr_tf,
      bloqueados: guardian.guard_blocked_symbols,
      simboloPips: guardian.guard_pip_symbol,
      riesgoPct: reglas.riesgo_por_trade_pct,
      riesgoUSD: riesgoFijoUSD,
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
      syncUrl: token ? `${window.location.origin}/api/trading/sync` : "",
      syncToken: token ?? "",
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
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{etiqueta}</span>
      <NumInput value={reglas[k] as number} onChange={(n) => setReglas({ ...reglas, [k]: n ?? 0 })} />
      {ayuda && <span className="text-[13px] text-muted">{ayuda}</span>}
    </label>
  );

  const barraMeses = (
    <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
      {["todo", ...mesesDisp].map((m) => (
        <button
          key={m}
          onClick={() => elegirMes(m)}
          className={`whitespace-nowrap rounded-pill px-3 py-1 text-sm font-medium ${mes === m ? "bg-[#1B3A5C] text-white" : "border border-border text-muted"}`}
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
        <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm">
          <span>
            <span className="font-medium">{t.simbolo}</span> {t.lado === "buy" ? "compra" : "venta"} {t.volumen}
            <span className="ml-2 text-muted">{horaCorta(t.hora_apertura)}</span>
            {t.violaciones.length > 0 && <span className="ml-2 text-red">⚠ {t.violaciones.length}</span>}
          </span>
          <span className={t.neto >= 0 ? "text-teal" : "text-red"}>{formatMoney(t.neto)}</span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 text-[14px] text-muted">
          <p>Duración {dur(t.duracionSeg)} · SL {t.sl ?? "no puso"} · TP {t.tp ?? "no puso"} · hora de Puerto Rico</p>
          {t.violaciones.map((v) => (
            <p key={v} className="text-red">• {NOMBRE_REGLA[v]}</p>
          ))}
          {f && <NotaTrade t={f} onGuardar={guardarNota} setups={setupsUsados} reglasPropias={reglasPropias} marcasIniciales={checks.get(f.id) ?? {}} />}
        </div>
      </details>
    );
  };

  if (cargando) return <div className="vc-shell"><p className="text-sm text-muted">Cargando...</p></div>;

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
    ["Resultado", `${formatMoney(metricas.neto)}${pctPeriodo === null ? "" : ` (${pctPeriodo >= 0 ? "+" : ""}${pctPeriodo.toFixed(2)}%)`}`, null],
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

      <p className="mb-4 text-[14px] text-muted">
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
          className="fixed bottom-20 left-1/2 z-50 w-[92%] max-w-md -translate-x-1/2 cursor-pointer rounded-lg px-4 py-3 text-base text-white shadow-lg"
          style={{ background: error ? "#d64545" : "#1f9d74" }}
        >
          {error ?? msg}
        </div>
      )}

      {cuentas.length === 0 || mostrarNueva ? (
        <div className="vc-card flex flex-col gap-3">
          <p className="text-base font-medium">{cuentas.length === 0 ? "Crea tu primera cuenta" : "Nueva cuenta"}</p>
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
            <button className="text-sm text-muted" onClick={() => setMostrarNueva(false)}>Cancelar</button>
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
            <button className="rounded-lg border border-border px-3 text-sm whitespace-nowrap" onClick={() => setMostrarNueva(true)}>+ Cuenta</button>
            <label className="vc-btn-primary cursor-pointer whitespace-nowrap text-center">
              Subir reporte
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && subirReporte(e.target.files[0])} />
            </label>
          </div>

          {syncToken && (
            <div className="vc-card mb-3 flex flex-wrap items-center justify-between gap-2 !p-3 text-sm">
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
            {([["panel", "Panel"], ["bitacora", "Bitácora"], ["estadisticas", "Estadísticas"], ["riesgo", "Riesgo"]] as const).map(([t, nombre]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-pill px-3 py-1 text-sm font-medium ${tab === t ? "bg-[#1B3A5C] text-white" : "border border-border text-muted"}`}
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
                <div className="vc-card text-center text-sm text-muted">Sube el reporte Excel de MT5 para ver tu panel.</div>
              ) : (
                <>
                  <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {rendimientos.map((r) => (
                      <div key={r.k} className="vc-card !p-3">
                        <p className="text-[13px] uppercase tracking-wide text-muted">{r.k}</p>
                        <p className={`text-xl font-medium ${r.neto > 0 ? "text-teal" : r.neto < 0 ? "text-red" : ""}`}>
                          {r.pct === null ? "—" : `${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(2)}%`}
                        </p>
                        <p className="text-[13px] text-muted">
                          {formatMoney(r.neto)} sobre {formatMoney(r.inicio, 0)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mb-4 text-[12px] text-muted">% contra el balance con que empezaste el día, el mes, el año y la cuenta.</p>

                  <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {kpis.map(([k, v, anillo]) => (
                      <div key={k} className="vc-card flex items-center justify-between !p-3">
                        <div>
                          <p className="text-[13px] uppercase tracking-wide text-muted">{k}</p>
                          <p className={`text-base font-medium ${k === "Resultado" ? (metricas.neto >= 0 ? "text-teal" : "text-red") : ""}`}>{v}</p>
                        </div>
                        {anillo !== null && <Anillo valor={anillo} color={k === "Disciplina" && anillo < 50 ? "#d64545" : undefined} />}
                      </div>
                    ))}
                  </div>

                  <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                      {calMes && <Calendario ym={calMes} onCambiarMes={cambiarMesCal} dias={diasAll} diaSel={diaSel} onDia={setDiaSel} pctDia={pctDia} />}
                    </div>
                    <div className="vc-card !p-3">
                      <p className="mb-2 text-sm uppercase tracking-wide text-muted">Cumplimiento de tus reglas</p>
                      <p className={`text-2xl font-medium ${metricas.disciplina >= 60 ? "text-teal" : "text-red"}`}>{metricas.disciplina.toFixed(0)}%</p>
                      <p className="mb-2 text-[14px] text-muted">de tus trades cumplieron todas tus reglas</p>
                      {(Object.keys(NOMBRE_REGLA) as (keyof typeof NOMBRE_REGLA)[])
                        .filter((r) => metricas.reglasRotas[r] > 0)
                        .sort((a, b) => metricas.reglasRotas[b] - metricas.reglasRotas[a])
                        .slice(0, 3)
                        .map((r) => (
                          <p key={r} className="flex justify-between text-sm">
                            <span>{NOMBRE_REGLA[r]}</span>
                            <span className="text-red">{metricas.reglasRotas[r]}</span>
                          </p>
                        ))}
                      <button className="mt-3 text-sm font-medium text-teal" onClick={() => setTab("riesgo")}>Ver cuánto te costó →</button>
                    </div>
                  </div>

                  {diaSel && (
                    <div className="vc-card mb-4 !p-0">
                      <p className="border-b border-border px-3 py-2 text-sm font-medium">
                        {nombreDia(diaSel)} · {tradesDia.length} trades ·{" "}
                        <span className={diasAll[diaSel]?.neto >= 0 ? "text-teal" : "text-red"}>{formatMoney(diasAll[diaSel]?.neto ?? 0)}</span>
                      </p>
                      <div className="divide-y divide-border">{tradesDia.map(filaTrade)}</div>
                    </div>
                  )}

                  <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <CurvaCapital serie={serie} base={basePeriodo} />
                    <BarrasMensuales meses={pctMeses} total={{ neto: netoTotal, pct: pctTotal }} mesSel={mes} onMes={elegirMes} />
                  </div>

                  <div className="vc-card !p-0">
                    <p className="border-b border-border px-3 py-2 text-sm uppercase tracking-wide text-muted">Trades recientes</p>
                    <div className="divide-y divide-border">
                      {[...evaluados]
                        .sort((a, b) => ((b.hora_cierre ?? b.hora_apertura) > (a.hora_cierre ?? a.hora_apertura) ? 1 : -1))
                        .slice(0, 8)
                        .map((t) => (
                          <div key={t.ticket} className="flex items-center justify-between gap-2 px-3 py-2 text-sm" style={{ borderLeft: `3px solid ${t.neto >= 0 ? "#1f9d74" : "#d64545"}` }}>
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
              <label className="mb-3 flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={soloRotas} onChange={(e) => setSoloRotas(e.target.checked)} />
                Ver solo trades donde rompí alguna regla
              </label>
              {gruposDia.length === 0 ? (
                <div className="vc-card text-center text-sm text-muted">
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
                        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm" style={{ borderLeft: `3px solid ${tot >= 0 ? "#1f9d74" : "#d64545"}` }}>
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

          {/* ---------------- ESTADÍSTICAS ---------------- */}
          {tab === "estadisticas" && <Estadisticas trades={evaluados} etiquetas={etiquetas} reglasPropias={reglasPropias} />}

          {/* ---------------- RIESGO ---------------- */}
          {tab === "riesgo" && (
            <>
              <div className="mb-4 rounded-lg p-3.5 text-base text-white" style={{ background: "#1B3A5C" }}>
                <p className="font-medium">Cómo te ayuda el manejo de riesgo</p>
                <ol className="mt-2 list-decimal pl-4 text-sm text-white/85">
                  <li className="mb-1">Defines tus reglas: cuánto arriesgas por trade, cuántas pérdidas aguantas al día y cuánto esperas después de perder.</li>
                  <li className="mb-1">La app revisa tu historial y te muestra qué trades las rompieron y cuánto te costó (abajo).</li>
                  <li>Descargas el guardián para MT5: pone el lote, el stop y el límite por ti y te bloquea cuando llegas a tu tope. Así no dependes de tu fuerza de voluntad en el momento.</li>
                </ol>
              </div>

              {metricas.trades > 0 && (
                <div className="vc-card mb-4">
                  <p className="mb-2 text-sm uppercase tracking-wide text-muted">Lo que te costó romper tus reglas{mes !== "todo" ? ` · ${nombreMes(mes)}` : ""}</p>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg p-3" style={{ background: "rgba(31,157,116,0.12)" }}>
                      <p className="text-[13px] uppercase text-muted">Cumpliste ({impacto.limpios.n})</p>
                      <p className={`text-base font-medium ${impacto.limpios.neto >= 0 ? "text-teal" : "text-red"}`}>{formatMoney(impacto.limpios.neto)}</p>
                    </div>
                    <div className="rounded-lg p-3" style={{ background: "rgba(214,69,69,0.12)" }}>
                      <p className="text-[13px] uppercase text-muted">Rompiste reglas ({impacto.rotos.n})</p>
                      <p className={`text-base font-medium ${impacto.rotos.neto >= 0 ? "text-teal" : "text-red"}`}>{formatMoney(impacto.rotos.neto)}</p>
                    </div>
                  </div>
                  {mesesDisp.length > 1 && (
                    <div className="mt-3">
                      <p className="mb-1 text-[13px] uppercase tracking-wide text-muted">Disciplina por mes</p>
                      {mesesDisp.map((m) => {
                        const l = evaluadosAll.filter((t) => fechaCierre(t).startsWith(m));
                        const pct = l.length ? (l.filter((t) => t.violaciones.length === 0).length / l.length) * 100 : 0;
                        return (
                          <div key={m} className="mb-1 flex items-center gap-2 text-[14px]">
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
                <p className="text-sm uppercase tracking-wide text-muted">Mi cuenta</p>
                {cuenta?.balance_actual != null ? (
                  <p className="text-base">
                    Balance en vivo desde MT5: <span className="font-medium">{formatMoney(cuenta.balance_actual)}</span>
                    <span className="block text-[13px] text-muted">Se actualiza solo mientras el guardián esté corriendo en MT5. Se usa para el riesgo por trade, el lote y los límites.</span>
                  </p>
                ) : (
                <div className="flex items-end gap-2">
                  <label className="flex flex-1 flex-col gap-1 text-sm">
                    <span className="text-muted">Balance de tu cuenta hoy ($)</span>
                    <NumInput value={balanceEdit} onChange={setBalanceEdit} />
                  </label>
                  <button className="rounded-lg border border-border px-3 py-2 text-sm" onClick={guardarBalance}>Guardar</button>
                </div>
                )}
                <p className="text-[13px] text-muted">Se usa para calcular tu riesgo por trade, el lote y los límites del guardián. El reporte no incluye depósitos ni retiros, por eso no lo calculo solo: actualízalo cuando cambie.</p>
              </div>

              <div className="vc-card mb-4 flex flex-col gap-3">
                <p className="text-sm uppercase tracking-wide text-muted">Mis reglas</p>
                <p className="text-[14px] text-muted">
                  Ponlas una vez. El guardián en MT5 las cumple por ti (calcula el lote, pone el stop y te bloquea al llegar al límite) y la bitácora mide si las respetaste.
                </p>
                <div className="rounded-lg border border-[#1B3A5C]/30 bg-[#1B3A5C]/5 p-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Cuánto puedo perder al día ($)</span>
                      <NumInput value={guardian.guard_daily_loss_usd} onChange={(n) => setGuardian({ ...guardian, guard_daily_loss_usd: n })} placeholder="Ej. 21" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-medium">Cuántas pérdidas aguanto al día</span>
                      <NumInput value={reglas.max_perdedores_dia} onChange={(n) => setReglas({ ...reglas, max_perdedores_dia: Math.max(0, Math.round(n ?? 0)) })} placeholder="Ej. 3" />
                    </label>
                    <label className="col-span-2 flex flex-col gap-1">
                      <span className="font-medium">Máximo de trades al día (ganando o perdiendo)</span>
                      <NumInput value={reglas.max_trades_dia} onChange={(n) => setReglas({ ...reglas, max_trades_dia: Math.max(0, Math.round(n ?? 0)) })} placeholder="Ej. 6 (0 = sin límite)" />
                    </label>
                  </div>
                  {riesgoFijoUSD > 0 ? (
                    <p className="mt-2 text-[14px]">
                      Cada trade arriesga <b>{formatMoney(riesgoFijoUSD)}</b>, en cualquier activo. Si pierdes {reglas.max_perdedores_dia} veces, llegas a{" "}
                      <b>{formatMoney(guardian.guard_daily_loss_usd ?? 0)}</b> y el guardián te bloquea hasta mañana.
                      {reglas.max_trades_dia > 0 ? <> Si vas ganando, sigues con el mismo riesgo hasta <b>{reglas.max_trades_dia} trades</b>.</> : <> Si vas ganando, sigues sin límite de trades.</>}{" "}
                      El lote se calcula solo para que, si toca el stop, pierdas eso.
                    </p>
                  ) : (
                    <p className="mt-2 text-[14px] text-muted">Pon cuánto puedes perder y cuántas pérdidas aguantas: ej. $21 entre 3 pérdidas = $7 por trade.</p>
                  )}
                </div>
                  <div className="col-span-2 rounded-lg border border-[#1B3A5C]/30 bg-[#1B3A5C]/5 p-3">
                    <p className="mb-2 font-medium">Stop y take profit (automáticos para cada activo)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1"><span className="text-muted">Mi estilo</span>
                        <select
                          className="vc-input"
                          value={guardian.guard_sl_mode === "atr" ? guardian.guard_atr_tf : ""}
                          onChange={(e) => setGuardian({ ...guardian, guard_sl_mode: "atr", guard_atr_tf: e.target.value as TemporalidadATR })}
                        >
                          {guardian.guard_sl_mode !== "atr" && <option value="">Escoge tu estilo…</option>}
                          <option value="M5">Scalping (operaciones de minutos)</option>
                          <option value="M15">Intradía (operaciones de horas)</option>
                          <option value="H1">Intradía largo (varias horas)</option>
                          <option value="H4">Swing (operaciones de días)</option>
                          {!["M5", "M15", "H1", "H4"].includes(guardian.guard_atr_tf) && <option value={guardian.guard_atr_tf}>Personalizado ({guardian.guard_atr_tf})</option>}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1"><span className="text-muted">Qué tan amplio el stop</span>
                        <select
                          className="vc-input"
                          value={guardian.guard_sl_mode === "atr" ? String(guardian.guard_atr_mult) : ""}
                          onChange={(e) => setGuardian({ ...guardian, guard_sl_mode: "atr", guard_atr_mult: Number(e.target.value) })}
                        >
                          {guardian.guard_sl_mode !== "atr" && <option value="">Escoge…</option>}
                          <option value="1">Ajustado (sale rápido si va en contra)</option>
                          <option value="1.5">Normal (recomendado)</option>
                          <option value="2.5">Amplio (le da más espacio al precio)</option>
                          {![1, 1.5, 2.5].includes(guardian.guard_atr_mult) && <option value={String(guardian.guard_atr_mult)}>Personalizado (×{guardian.guard_atr_mult})</option>}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1"><span className="text-muted">Take profit</span>
                        <select className="vc-input" value={String(guardian.guard_reward_ratio)} onChange={(e) => setGuardian({ ...guardian, guard_reward_ratio: Number(e.target.value) })}>
                          <option value="0">Sin take profit (lo cierro yo)</option>
                          <option value="1">1 a 1 (gano lo mismo que arriesgo)</option>
                          <option value="1.5">1.5 a 1</option>
                          <option value="2">2 a 1 (recomendado)</option>
                          <option value="3">3 a 1</option>
                          <option value="4">4 a 1</option>
                          {![0, 1, 1.5, 2, 3, 4].includes(guardian.guard_reward_ratio) && <option value={String(guardian.guard_reward_ratio)}>{guardian.guard_reward_ratio} a 1</option>}
                        </select>
                      </label>
                    </div>
                    {guardian.guard_sl_mode === "atr" ? (
                      <p className="mt-2 text-[14px]">
                        El guardián mide cuánto se mueve <b>cada activo</b> en velas de {guardian.guard_atr_tf} y pone el stop a{" "}
                        {guardian.guard_atr_mult === 1 ? "una" : guardian.guard_atr_mult} vez{guardian.guard_atr_mult === 1 ? "" : "es"} ese movimiento. Así EUR/USD, oro o BTC
                        tienen cada uno un stop razonable, y el lote se ajusta para que si toca el stop pierdas <b>{riesgoFijoUSD > 0 ? formatMoney(riesgoFijoUSD) : `${reglas.riesgo_por_trade_pct}% de tu cuenta`}</b>
                        {guardian.guard_reward_ratio > 0 ? <>; si llega al take profit ganas <b>{riesgoFijoUSD > 0 ? formatMoney(riesgoFijoUSD * guardian.guard_reward_ratio) : `${guardian.guard_reward_ratio} veces eso`}</b>.</> : "."}
                        {" "}Activo más volátil = stop más lejos y lote más pequeño.
                      </p>
                    ) : (
                      <p className="mt-2 text-[14px] text-red">Estás usando un stop fijo ({guardian.guard_sl_mode === "pips" ? "pips" : "% del precio"}). Escoge tu estilo arriba para que se calcule solo en cada activo.</p>
                    )}
                  </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <label className="flex flex-col gap-1"><span className="text-muted">Trades abiertos a la vez</span>
                    <NumInput value={guardian.guard_max_open} onChange={(n) => setGuardian({ ...guardian, guard_max_open: n ?? 1 })} />
                  </label>
                  <label className="flex flex-col gap-1"><span className="text-muted">Activos prohibidos (opcional)</span>
                    <input
                      className="vc-input"
                      placeholder="Ej. BTCUSD, ETHUSD, GBPJPY"
                      value={guardian.guard_blocked_symbols}
                      onChange={(e) => setGuardian({ ...guardian, guard_blocked_symbols: e.target.value.toUpperCase() })}
                    />
                    <span className="text-[13px] text-muted">Los que te queman la cuenta. Si abres uno, el guardián lo cierra al instante y borra sus órdenes pendientes.</span>
                  </label>
                </div>
                <details className="rounded-lg border border-border p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-muted">Más reglas (opcional)</summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 flex flex-col gap-1"><span className="text-muted">Qué puedo operar</span>
                    <select
                      className="vc-input"
                      value={todosActivos ? "todos" : "lista"}
                      onChange={(e) => setGuardian({ ...guardian, guard_symbol: e.target.value === "todos" ? "*" : "XAUUSD" })}
                    >
                      <option value="todos">Todos los activos (forex, oro, índices, acciones, futuros, cripto)</option>
                      <option value="lista">Solo los símbolos que escoja</option>
                    </select>
                  </label>
                  {!todosActivos && (
                    <label className="col-span-2 flex flex-col gap-1"><span className="text-muted">Símbolos permitidos</span>
                      <input
                        className="vc-input"
                        list="vt-simbolos"
                        value={guardian.guard_symbol}
                        onChange={(e) => {
                          const v = e.target.value.toUpperCase();
                          const inf = infoSimbolo(v.split(",")[0].trim());
                          const primero = v.split(",")[0].trim();
                          setGuardian({ ...guardian, guard_symbol: v, ...(primero ? { guard_pip_symbol: primero } : {}), ...(inf ? { guard_pip_size: inf.pip } : {}) });
                        }}
                      />
                      <span className="text-[13px] text-muted">Como aparecen en tu broker, separados por coma (ej. XAUUSD, EURUSD, NAS100, BTCUSD, #AAPL). Acepta sufijos como .r o m.</span>
                    </label>
                  )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-muted">Espera después de una pérdida (min)</span>
                        <NumInput value={reglas.espera_tras_perdida_min} onChange={(n) => setReglas({ ...reglas, espera_tras_perdida_min: Math.max(0, Math.round(n ?? 0)) })} />
                        <span className="text-[13px] text-muted">Para no entrar con revancha. 0 = sin espera.</span>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-muted">Piso de la cuenta ($)</span>
                        <NumInput value={guardian.guard_min_equity_usd} onChange={(n) => setGuardian({ ...guardian, guard_min_equity_usd: n })} placeholder="Automático" />
                        <span className="text-[13px] text-muted">Si la cuenta baja de aquí, se bloquea todo (como el drawdown máximo de una cuenta de fondeo).</span>
                      </label>
                    </div>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted">Qué puedo hacer con el stop y el take profit</span>
                  <select className="vc-input" value={guardian.guard_lock_mode} onChange={(e) => setGuardian({ ...guardian, guard_lock_mode: e.target.value as Guardian["guard_lock_mode"] })}>
                    <option value="flexible">Flexible: el stop siempre puesto; lo muevo solo a mi favor y el TP libre</option>
                    <option value="total">Estricto: no puedo mover ninguno</option>
                    <option value="ninguno">Sin bloqueo: solo pone el stop al abrir</option>
                  </select>
                  <span className="text-[13px] text-muted">
                    Flexible deja proteger la ganancia y perseguir el precio (subir el stop, ampliar el TP), pero nunca alejar el stop ni quitarlo. Con take profit en 0 el guardián no pone TP al abrir.
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={guardian.guard_block_manual_close} onChange={(e) => setGuardian({ ...guardian, guard_block_manual_close: e.target.checked })} />
                  Si cierro un trade a mano, bloquear el resto del día
                </label>
                    <details className="mt-2 text-[13px]">
                      <summary className="cursor-pointer text-muted">Avanzado: stop fijo en pips o en % del precio</summary>
                      <div className="mt-2 grid grid-cols-2 gap-3">
                  <label className="col-span-2 flex flex-col gap-1"><span className="text-muted">Tipo de stop</span>
                    <select className="vc-input" value={guardian.guard_sl_mode} onChange={(e) => setGuardian({ ...guardian, guard_sl_mode: e.target.value as ModoStop })}>
                      <option value="atr">Según la volatilidad (ATR): se ajusta solo a cada activo</option>
                      <option value="porcentaje">A una distancia fija en % del precio</option>
                      <option value="pips">A una distancia fija en pips (un solo símbolo)</option>
                    </select>
                    {guardian.guard_sl_mode === "pips" && (
                      <span className="text-[13px] text-muted">Los pips aplican solo a {guardian.guard_pip_symbol || "tu activo"}. El forex usa sus pips de siempre y los demás activos (cripto, índices, acciones) el ATR.</span>
                    )}
                  </label>
                  {guardian.guard_sl_mode === "pips" && (
                    <>
                      <label className="col-span-2 flex flex-col gap-1"><span className="text-muted">Activo de esos pips</span>
                        <input
                          className="vc-input"
                          list="vt-simbolos"
                          value={guardian.guard_pip_symbol}
                          onChange={(e) => {
                            const v = e.target.value.toUpperCase().trim();
                            const inf = infoSimbolo(v);
                            setGuardian({ ...guardian, guard_pip_symbol: v, ...(inf ? { guard_pip_size: inf.pip } : {}) });
                          }}
                        />
                      </label>
                      <label className="flex flex-col gap-1"><span className="text-muted">Distancia del stop en pips</span>
                        <NumInput value={guardian.guard_sl_pips} onChange={(n) => setGuardian({ ...guardian, guard_sl_pips: n ?? 0 })} />
                        <span className="text-[13px] text-muted">Oro: 60 pips = $6 de precio</span>
                      </label>
                      <label className="flex flex-col gap-1"><span className="text-muted">Tamaño de 1 pip (precio)</span>
                        <NumInput value={guardian.guard_pip_size} onChange={(n) => setGuardian({ ...guardian, guard_pip_size: n ?? 0 })} />
                        <span className="text-[13px] text-muted">Se llena solo para símbolos conocidos</span>
                      </label>
                    </>
                  )}
                  {guardian.guard_sl_mode !== "porcentaje" && (
                    <>
                      <label className="flex flex-col gap-1"><span className="text-muted">{guardian.guard_sl_mode === "pips" ? "Demás activos: stop = ATR ×" : "Stop = ATR ×"}</span>
                        <NumInput value={guardian.guard_atr_mult} onChange={(n) => setGuardian({ ...guardian, guard_atr_mult: n ?? 0 })} />
                        <span className="text-[13px] text-muted">Distancia del stop. 1.5 = una vez y media el movimiento promedio de una vela</span>
                      </label>
                      <label className="flex flex-col gap-1"><span className="text-muted">Temporalidad del ATR</span>
                        <select className="vc-input" value={guardian.guard_atr_tf} onChange={(e) => setGuardian({ ...guardian, guard_atr_tf: e.target.value as TemporalidadATR })}>
                          {TFS_ATR.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                    </>
                  )}
                  <label className="flex flex-col gap-1"><span className="text-muted">{guardian.guard_sl_mode === "porcentaje" ? "Distancia del stop (% del precio del activo)" : "Distancia de respaldo (% del precio)"}</span>
                    <NumInput value={guardian.guard_sl_pct} onChange={(n) => setGuardian({ ...guardian, guard_sl_pct: n ?? 0 })} />
                    <span className="text-[13px] text-muted">{guardian.guard_sl_mode === "porcentaje"
                        ? `No es lo que arriesgas: es qué tan lejos queda el stop. Ej. ${guardian.guard_sl_pct || 0.5}% en oro a $4,000 = stop a ${formatMoney((4000 * (guardian.guard_sl_pct || 0.5)) / 100, 0)} de la entrada. Lo que pierdes sigue siendo tu ${reglas.riesgo_por_trade_pct}%.`
                        : "Se usa si el ATR o los pips no aplican a un activo"}</span>
                  </label>
                      </div>
                    </details>
                  </div>
                </details>
                <div className="rounded-lg border border-teal/40 bg-teal/5 p-3 text-[14px]">
                  <p className="mb-2 font-medium">Tus límites de hoy (como una cuenta de fondeo)</p>
                  <div className="mb-3 flex flex-col gap-2">
                    {[
                      { k: "Pérdida del día", v: usoHoy.perdido, max: limitePerdidaDia, txt: `${formatMoney(usoHoy.perdido)} de ${formatMoney(limitePerdidaDia)}` },
                      { k: "Trades perdedores", v: usoHoy.perdedores, max: reglas.max_perdedores_dia, txt: `${usoHoy.perdedores} de ${reglas.max_perdedores_dia}` },
                      { k: "Trades del día", v: usoHoy.trades, max: reglas.max_trades_dia, txt: reglas.max_trades_dia > 0 ? `${usoHoy.trades} de ${reglas.max_trades_dia}` : `${usoHoy.trades} (sin límite)` },
                    ].map((b) => {
                      const pct = b.max > 0 ? Math.min(100, (b.v / b.max) * 100) : 0;
                      return (
                        <div key={b.k}>
                          <div className="flex justify-between text-[13px]">
                            <span>{b.k}</span>
                            <span className={pct >= 100 ? "font-medium text-red" : "text-muted"}>{b.txt}{pct >= 100 ? " · bloqueado" : ""}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-border">
                            <div className={`h-full ${pct >= 100 ? "bg-red" : pct >= 66 ? "bg-[#d97706]" : "bg-teal"}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mb-1 font-medium">Así te va a cuidar el guardián</p>
                  <ul className="flex list-disc flex-col gap-0.5 pl-5">
                    <li>
                      Cada trade arriesga <b>{riesgoFijoUSD > 0 ? formatMoney(riesgoFijoUSD) : `${reglas.riesgo_por_trade_pct}% de tu cuenta`}</b>: el lote se calcula solo en cualquier activo.
                    </li>
                    <li>
                      Stop puesto siempre al abrir{guardian.guard_sl_mode === "atr" ? <>, según cuánto se mueve cada activo (velas de {guardian.guard_atr_tf})</> : null}
                      {guardian.guard_reward_ratio > 0 ? <>; take profit a {guardian.guard_reward_ratio} veces el stop.</> : "; sin take profit automático."}
                    </li>
                    <li>
                      Te bloquea hasta mañana si pierdes <b>{reglas.max_perdedores_dia}</b> trades
                      {guardian.guard_daily_loss_usd ? <> o llegas a <b>-{formatMoney(guardian.guard_daily_loss_usd)}</b> en el día</> : <> o pierdes el {reglas.perdida_max_dia_pct}% de la cuenta en el día</>}.
                    </li>
                    <li>
                      Máximo <b>{reglas.max_trades_dia > 0 ? reglas.max_trades_dia : "sin límite de"}</b> trades al día y <b>{guardian.guard_max_open}</b> abiertos a la vez
                      {reglas.espera_tras_perdida_min > 0 ? <>; espera {reglas.espera_tras_perdida_min} min después de una pérdida</> : null}.
                    </li>
                    {guardian.guard_blocked_symbols.trim() && <li>Prohibido operar: {guardian.guard_blocked_symbols}.</li>}
                    <li>
                      {guardian.guard_lock_mode === "flexible"
                        ? "El stop solo lo puedes mover a tu favor; nunca alejarlo ni quitarlo."
                        : guardian.guard_lock_mode === "total"
                          ? "No puedes mover el stop ni el take profit."
                          : "Puedes mover el stop y el take profit libremente."}
                      {guardian.guard_block_manual_close ? " Si cierras un trade a mano, se bloquea el resto del día." : ""}
                    </li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <button className="vc-btn-primary" onClick={guardarReglas}>Guardar reglas</button>
                  <button className="rounded-lg border border-[#1B3A5C] px-4 text-base font-medium text-[#1B3A5C]" onClick={descargarGuardian}>Descargar para MT5</button>
                </div>
                <div className="rounded-lg border border-border p-3 text-sm">
                  <p className="mb-1 font-medium">Sincronización en vivo</p>
                  {syncToken ? (
                    <>
                      <p className="text-muted">
                        Activa para <b>{cuenta?.nombre}</b>. El guardián envía tus trades cerrados y tu balance cada 30 segundos, y este panel se actualiza solo. Si cambiaste algo, <b>descarga el guardián otra vez</b> y reemplázalo en MT5 (lleva tu token adentro).
                      </p>
                      <div className="mt-2 flex gap-3">
                        <button className="text-teal" onClick={() => activarSync()}>Generar token nuevo</button>
                        <button className="text-red" onClick={desactivarSync}>Desactivar</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-muted">Sin subir reportes: el guardián manda tus trades y tu balance a este panel mientras MT5 esté abierto.</p>
                      <button className="mt-2 rounded-lg border border-[#1B3A5C] px-3 py-1.5 font-medium text-[#1B3A5C]" onClick={() => activarSync()}>Activar sincronización</button>
                    </>
                  )}
                  {syncToken && (
                    <p className="mt-2 text-[13px] text-muted">
                      Una sola vez en MT5: <b>Herramientas → Opciones → Asesores Expertos</b>, marca <b>Permitir WebRequest para las URL listadas</b> y agrega <b>{typeof window !== "undefined" ? window.location.origin : ""}</b>.
                    </p>
                  )}
                </div>
                <details className="text-[14px] text-muted" open={!cuenta?.last_sync_at}>
                  <summary className="cursor-pointer text-sm font-medium text-teal">Cómo instalarlo en MT5 (5 minutos, una sola vez)</summary>
                  <div className="mt-2 rounded-lg border border-border bg-bg p-2.5">
                    <p className="font-medium text-[#1B3A5C]">¿Tienes Mac?</p>
                    <p>
                      Funciona igual. Baja <b>MT5 para Mac</b> (app de escritorio) desde tu broker o desde metatrader5.com: necesita macOS Catalina o más nuevo, Intel o Apple M1 en adelante.
                      El MT5 del navegador (web) <b>no sirve</b>: no acepta asesores expertos. Diferencias en los pasos de abajo:
                    </p>
                    <ul className="mt-1 list-disc pl-4">
                      <li>
                        Paso 2: si “Abrir carpeta de datos” no te deja pegar el archivo, en el <b>Finder</b> pulsa <b>Cmd+Shift+G</b> y pega{" "}
                        <b className="break-all">~/Library/Application Support/net.metaquotes.wine.metatrader5/drive_c/Program Files/MetaTrader 5/MQL5/Experts</b>, y arrastra ahí el archivo desde Descargas.
                      </li>
                      <li>Las teclas F4 y F7 son <b>fn+F4</b> y <b>fn+F7</b> (o usa los botones MetaEditor y Compilar). Dentro de MT5 los atajos van con <b>Control</b>, no con Command: Ctrl+N.</li>
                      <li>La Mac tiene que estar prendida, sin dormir y con MT5 abierto para que el guardián te proteja. Para 24/7 usa un VPS con Windows.</li>
                    </ul>
                  </div>
                  <ol className="mt-2 flex list-decimal flex-col gap-1 pl-4">
                    <li>Arriba, pulsa <b>Descargar para MT5</b>. El archivo <b>VictorGuard.mq5</b> ya lleva tus reglas y tu conexión con VICTOR.</li>
                    <li>En MT5 abre <b>Archivo → Abrir carpeta de datos</b>, entra a <b>MQL5 → Experts</b> y copia ahí el archivo (si ya tenías uno, reemplázalo).</li>
                    <li>Pulsa <b>F4</b> para abrir MetaEditor, abre <b>VictorGuard.mq5</b> y pulsa <b>Compilar (F7)</b>. Abajo debe decir <b>0 errors</b>.</li>
                    <li>
                      En MT5: <b>Herramientas → Opciones → Asesores Expertos</b>, marca <b>Permitir WebRequest para las URL listadas</b> y agrega{" "}
                      <b>{typeof window !== "undefined" ? window.location.origin : "https://www.victorcfo.com"}</b>. Así tus trades llegan solos a la bitácora.
                    </li>
                    <li>
                      Activa el botón <b>Algo Trading</b> de la barra de MT5 (debe quedar verde). Para que no se apague solo: en <b>Herramientas → Opciones → Asesores Expertos</b> desmarca
                      las casillas de <b>“Deshabilitar el trading algorítmico al cambiar de cuenta / de perfil”</b>. Si se apaga, el guardián te avisa en rojo: sin Algo Trading no te puede proteger.
                    </li>
                    <li>
                      En el <b>Navegador</b> (Ctrl+N) busca <b>Asesores Expertos → VictorGuard</b> y arrástralo a <b>un solo gráfico</b>, de cualquier activo. En la ventana que abre, pestaña
                      <b> Común</b>, marca <b>Permitir Algo Trading</b> y pulsa Aceptar.
                    </li>
                    <li>Listo: arriba a la izquierda del gráfico verás VENDER / COMPRAR y tu estado. Vigila todas tus posiciones de la cuenta. Pruébalo primero en demo.</li>
                  </ol>
                  <p className="mt-2">Si cambias tus reglas aquí, descárgalo otra vez y repite los pasos 2 y 3. También puedes ajustar valores en MT5, en la pestaña <b>Entradas</b> del guardián.</p>
                </details>
                <p className="text-[13px] text-muted">Para MT4 el programa es distinto y todavía no está disponible. Es una herramienta de control propio, no una señal ni una garantía de resultados.</p>
              </div>

              <ReglasPropias reglas={reglasPropias} onCambio={setReglasPropias} />

              <div className="vc-card mb-4 flex flex-col gap-3">
                <p className="text-sm uppercase tracking-wide text-muted">Calculadora de lote</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
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
                  <p className="text-[13px] text-muted">
                    1 pip = {pipSize} de precio · stop = {distPrecio.toFixed(5).replace(/0+$/, "").replace(/\.$/, "")} de precio. Si tu broker cuenta los pips distinto, ajusta el tamaño en el guardián.
                  </p>
                )}
                {lote ? (
                  <div className="rounded-lg bg-bg p-3 text-base">
                    <p>Riesgo permitido: <span className="font-medium">{formatMoney(lote.riesgoUSD)}</span> ({reglas.riesgo_por_trade_pct}%)</p>
                    <p>Lote máximo: <span className="font-medium">{lote.lote.toFixed(2)}</span></p>
                    {lote.loteMinimoExcede && (
                      <p className="mt-1 text-sm text-red">
                        Ni el lote mínimo cabe en tu regla: con 0.01 arriesgarías {formatMoney(lote.riesgoConLoteMinimo)}. Reduce el stop o sube el balance.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Escribe las unidades por lote de ese símbolo para calcular.</p>
                )}
              </div>

              <div className="vc-card">
                <p className="mb-2 text-sm uppercase tracking-wide text-muted">Reglas rotas{mes !== "todo" ? ` · ${nombreMes(mes)}` : ""}</p>
                {metricas.trades === 0 ? (
                  <p className="text-sm text-muted">Sube un reporte para ver el cumplimiento.</p>
                ) : (
                  <div className="flex flex-col gap-1 text-sm">
                    {(Object.keys(NOMBRE_REGLA) as (keyof typeof NOMBRE_REGLA)[]).map((r) => (
                      <p key={r} className="flex justify-between">
                        <span>{NOMBRE_REGLA[r]}</span>
                        <span className={metricas.reglasRotas[r] > 0 ? "text-red" : "text-muted"}>{metricas.reglasRotas[r]}</span>
                      </p>
                    ))}
                    <p className="mt-2 text-[13px] text-muted">
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

const TFS = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"];
type Adjunto = { id: string; nombre: string | null; tipo: string | null; bytes: number | null };

function NotaTrade({
  t,
  onGuardar,
  setups,
  reglasPropias,
  marcasIniciales,
}: {
  t: FilaTrade;
  onGuardar: (t: FilaTrade, nota: string, cumpli: boolean | null, tf: string | null, setup: string | null, marcas: Record<string, boolean>) => Promise<string | null>;
  setups: string[];
  reglasPropias: ReglaPropia[];
  marcasIniciales: Record<string, boolean>;
}) {
  const [marcas, setMarcas] = useState<Record<string, boolean>>(marcasIniciales);
  const [nota, setNota] = useState(t.nota ?? "");
  const [cumpli, setCumpli] = useState<boolean | null>(t.cumpli_plan);
  const [tf, setTf] = useState<string>(t.timeframe ?? "");
  const [setup, setSetup] = useState<string>(t.setup ?? "");
  const [estado, setEstado] = useState<"" | "guardando" | "ok" | string>("");
  async function guardar() {
    setEstado("guardando");
    const validas = Object.fromEntries(Object.entries(marcas).filter(([k]) => reglasPropias.some((r) => r.id === k)));
    const err = await onGuardar(t, nota, cumpli, tf || null, setup || null, validas);
    if (err) return setEstado(`No se pudo guardar: ${err}`);
    setEstado("ok");
    setTimeout(() => setEstado((s) => (s === "ok" ? "" : s)), 2500);
  }
  return (
    <div className="flex flex-col gap-2">
      <textarea className="vc-input" rows={2} placeholder="Nota: ¿por qué entraste?" value={nota} onChange={(e) => { setNota(e.target.value); setEstado(""); }} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          TF
          <select className="vc-input !w-auto !py-1" value={tf} onChange={(e) => { setTf(e.target.value); setEstado(""); }}>
            <option value="">—</option>
            {TFS.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[180px] flex-1 items-center gap-1">
          Setup
          <input
            className="vc-input !py-1"
            list={`setups-${t.id}`}
            maxLength={60}
            placeholder="ej. ruptura, pullback"
            value={setup}
            onChange={(e) => { setSetup(e.target.value); setEstado(""); }}
          />
          <datalist id={`setups-${t.id}`}>
            {setups.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </label>
      </div>
      {reglasPropias.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-border p-2">
          <span className="text-[13px] uppercase tracking-wide">Mi checklist</span>
          {reglasPropias.map((r) => {
            const v = marcas[r.id];
            const marcar = (val: boolean) => {
              const m = { ...marcas };
              if (m[r.id] === val) delete m[r.id];
              else m[r.id] = val;
              setMarcas(m);
              setEstado("");
              // Si marcó todas, "¿Cumplí mi plan?" se pone solo.
              if (reglasPropias.every((x) => x.id in m)) setCumpli(reglasPropias.every((x) => m[x.id]));
            };
            return (
              <div key={r.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => marcar(true)}
                  className={`h-7 w-7 rounded-full border text-sm ${v === true ? "border-teal bg-teal text-white" : "border-border"}`}
                  aria-label="La cumplí"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => marcar(false)}
                  className={`h-7 w-7 rounded-full border text-sm ${v === false ? "border-red bg-red text-white" : "border-border"}`}
                  aria-label="No la cumplí"
                >
                  ✗
                </button>
                <span className={v === undefined ? "" : "font-medium"}>{r.texto}</span>
              </div>
            );
          })}
        </div>
      )}
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
        <button type="button" className="ml-auto rounded-pill bg-[#1d6fe0] px-3 py-0.5 font-medium text-white disabled:opacity-50" disabled={estado === "guardando"} onClick={guardar}>
          {estado === "guardando" ? "Guardando..." : estado === "ok" ? "✓ Guardado" : "Guardar"}
        </button>
      </div>
      {estado && estado !== "ok" && estado !== "guardando" && <p className="text-red">{estado}</p>}
      <AdjuntosTrade tradeId={t.id} />
    </div>
  );
}

// Archivos del trade (capturas de la gráfica, PDF). Se cargan al abrir el trade.
function AdjuntosTrade({ tradeId }: { tradeId: string }) {
  const [lista, setLista] = useState<Adjunto[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState("");
  const [grande, setGrande] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Solo pide la lista cuando el trade se abre (el contenido de un <details> cerrado no se ve).
  useEffect(() => {
    const el = caja.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true));
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let vivo = true;
    fetch(`/api/trading/adjuntos?tradeId=${tradeId}`)
      .then((r) => r.json())
      .then((j) => vivo && setLista(j.adjuntos ?? []))
      .catch(() => vivo && setLista([]));
    return () => {
      vivo = false;
    };
  }, [tradeId, visible]);

  async function subir(files: File[]) {
    if (!files.length) return;
    setSubiendo(true);
    setErr("");
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f, f.name || `captura-${Date.now()}.png`);
      fd.append("tradeId", tradeId);
      const r = await fetch("/api/trading/adjuntos", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? "No se pudo subir.");
        break;
      }
      setLista((prev) => [...(prev ?? []), j.adjunto]);
    }
    setSubiendo(false);
    if (input.current) input.current.value = "";
  }

  async function borrar(a: Adjunto) {
    if (!confirm(`¿Borrar ${a.nombre ?? "este archivo"}?`)) return;
    const r = await fetch(`/api/trading/adjuntos/${a.id}`, { method: "DELETE" });
    if (r.ok) setLista((prev) => (prev ?? []).filter((x) => x.id !== a.id));
    else setErr("No se pudo borrar.");
  }

  return (
    <div
      ref={caja}
      className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2 outline-none focus:border-teal"
      tabIndex={0}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData.files);
        if (files.length) {
          e.preventDefault();
          subir(files);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        subir(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span>Archivos</span>
        <span className="text-[12px]">capturas o PDF · arrastra aquí, o haz clic en este cuadro y pega con Ctrl+V</span>
        <button type="button" className="ml-auto rounded-pill border border-[#1d6fe0] px-3 py-0.5 font-medium text-[#1d6fe0] disabled:opacity-50" disabled={subiendo} onClick={() => input.current?.click()}>
          {subiendo ? "Subiendo..." : "+ Subir archivo"}
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" multiple hidden onChange={(e) => subir(Array.from(e.target.files ?? []))} />
      </div>
      {lista && lista.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {lista.map((a) => {
            const url = `/api/trading/adjuntos/${a.id}/ver`;
            const img = (a.tipo ?? "").startsWith("image/");
            return (
              <div key={a.id} className="relative">
                {img ? (
                  <button type="button" onClick={() => setGrande(url)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={a.nombre ?? "captura"} className="h-20 w-28 rounded border border-border object-cover" />
                  </button>
                ) : (
                  <a href={url} target="_blank" rel="noreferrer" className="flex h-20 w-28 items-center justify-center overflow-hidden rounded border border-border p-1 text-center text-[12px] text-[#1d6fe0]">
                    📄 {a.nombre ?? "PDF"}
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => borrar(a)}
                  className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-red text-[12px] leading-5 text-white"
                  aria-label="Borrar archivo"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
      {err && <p className="text-red">{err}</p>}
      {grande && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setGrande(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grande} alt="captura" className="max-h-full max-w-full rounded" />
        </div>
      )}
    </div>
  );
}
