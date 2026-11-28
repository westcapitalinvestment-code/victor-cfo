import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cfgGuardian } from "@/lib/trading-bloqueos";
import { aplicarPendientes, guardarReglas } from "@/lib/trading-reglas-server";
import { pedirVinculo } from "@/lib/trading-vinculo";
import { avisosTrading } from "@/lib/trading-avisos";

// Sincronización en vivo con MT5 (oct 2026). El guardián (VictorGuard.mq5)
// llama aquí cada ~30 s con WebRequest. No hay sesión de usuario: la
// autenticación es el token de la cuenta (trading_sync_tokens), que solo
// permite escribir trades y balance en ESA cuenta. Por eso se usa el cliente
// admin y se valida todo a mano.
export const dynamic = "force-dynamic";

const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};
const RE_FECHA = /^\d{4}[.-]\d{2}[.-]\d{2} \d{2}:\d{2}(:\d{2})?$/;
const fecha = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return RE_FECHA.test(s) ? s.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3") : null;
};

// Guardián 4.0: las reglas también se cambian desde el panel "Reglas" en MT5. Llegan
// en "set" y se guardan igual que en la web (apretar = ya; aflojar = desde mañana).
// Riesgo por trade ($) x pérdidas al día = pérdida máxima del día en $.
function cambiosDesdeMT5(s: Record<string, unknown>): Record<string, unknown> | null {
  const v = (k: string) => {
    const x = Number(s[k]);
    return Number.isFinite(x) ? x : NaN;
  };
  const rm = v("rm"), ml = Math.round(v("ml")), mt = Math.round(v("mt")), mo = Math.round(v("mo")), rr = v("rr"), cd = Math.round(v("cd"));
  if (!(rm > 0 && rm <= 1_000_000) || !(ml >= 1 && ml <= 50) || !(mt >= 0 && mt <= 100) || !(mo >= 1 && mo <= 20) || !(rr >= 0 && rr <= 10) || !(cd >= 0 && cd <= 1440))
    return null;
  return {
    guard_daily_loss_usd: Math.round(rm * ml * 100) / 100,
    max_perdedores_dia: ml,
    max_trades_dia: mt,
    guard_max_open: mo,
    guard_reward_ratio: Math.round(rr * 100) / 100,
    espera_tras_perdida_min: cd,
  };
}
// El guardián lee el mensaje sin acentos ni comillas.
const ascii = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 .,:;()$%/+-]/g, "").slice(0, 120);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const admin = createAdminClient();

  // Guardián sin token (3.21+): pide su código de 6 dígitos o recoge su token.
  if (!token && body?.pair && typeof body.pair === "object") {
    const r = await pedirVinculo(admin, {
      install: String(body.pair.install ?? ""),
      login: String(body.pair.login ?? ""),
      servidor: String(body.pair.server ?? ""),
    });
    if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, ...r });
  }

  if (token.length < 32 || token.length > 128) return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  const { data: t } = await admin.from("trading_sync_tokens").select("account_id, owner_id").eq("token", token).maybeSingle();
  if (!t) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  // 3.21+: el guardián manda su número de cuenta de MT5. Si la cuenta de VICTOR ya
  // tiene otro número, se rechaza (evita mezclar la demo con la real).
  const loginMT5 = typeof body?.login === "string" ? body.login.replace(/\D/g, "") : "";
  if (loginMT5) {
    const { data: ac0 } = await admin.from("trading_accounts").select("numero_cuenta").eq("id", t.account_id).maybeSingle();
    const num = String(ac0?.numero_cuenta ?? "").replace(/\D/g, "");
    if (num && num !== loginMT5) return NextResponse.json({ error: "Este código es de otra cuenta de MT5." }, { status: 409 });
    if (!num) await admin.from("trading_accounts").update({ numero_cuenta: loginMT5 }).eq("id", t.account_id);
  }

  const lista = Array.isArray(body?.trades) ? body.trades.slice(0, 200) : [];
  const filas: Record<string, unknown>[] = [];
  for (const x of lista) {
    const apertura = fecha(x?.open_time);
    const lado = x?.side === "sell" ? "sell" : x?.side === "buy" ? "buy" : null;
    const ticket = typeof x?.ticket === "string" || typeof x?.ticket === "number" ? String(x.ticket).slice(0, 40) : "";
    const simbolo = typeof x?.symbol === "string" ? x.symbol.replace(/[^A-Za-z0-9._#-]/g, "").slice(0, 20) : "";
    if (!apertura || !lado || !ticket || !simbolo) continue;
    const sl = num(x.sl);
    const tp = num(x.tp);
    filas.push({
      owner_id: t.owner_id,
      account_id: t.account_id,
      ticket,
      simbolo,
      lado,
      volumen: num(x.volume),
      hora_apertura: apertura,
      precio_apertura: num(x.open_price),
      sl: sl > 0 ? sl : null,
      tp: tp > 0 ? tp : null,
      hora_cierre: fecha(x.close_time),
      precio_cierre: num(x.close_price),
      comision: num(x.commission),
      swap: num(x.swap),
      ganancia: num(x.profit),
      // riesgo en dinero al abrir, calculado por el guardián con los datos del broker (cualquier activo)
      riesgo_usd: num(x.risk, -1) > 0 ? num(x.risk) : null,
    });
  }
  // .select() devuelve solo las filas NUEVAS (las que ya estaban se ignoran): con eso
  // salen los avisos al celular de "trade cerrado" sin repetirse.
  let nuevos: { ticket: string; simbolo: string; ganancia: number; comision: number; swap: number }[] = [];
  if (filas.length) {
    const { data: ins, error } = await admin
      .from("trades")
      .upsert(filas, { onConflict: "account_id,ticket", ignoreDuplicates: true })
      .select("ticket, simbolo, ganancia, comision, swap");
    if (error) return NextResponse.json({ error: "No se pudieron guardar los trades." }, { status: 500 });
    nuevos = ins ?? [];
  }

  const ahora = new Date().toISOString();
  const cuenta: Record<string, unknown> = { last_sync_at: ahora };
  if (typeof body?.balance === "number" && Number.isFinite(body.balance)) cuenta.balance_actual = body.balance;
  if (typeof body?.equity === "number" && Number.isFinite(body.equity)) cuenta.equity_actual = body.equity;
  await admin.from("trading_accounts").update(cuenta).eq("id", t.account_id);
  // Si la persona no puso balance inicial al crear la cuenta, se toma el de MT5
  // en la primera sincronización (así no tiene que escribirlo a mano).
  if (typeof body?.balance === "number" && Number.isFinite(body.balance) && body.balance > 0) {
    await admin.from("trading_accounts").update({ balance_inicial: body.balance }).eq("id", t.account_id).or("balance_inicial.is.null,balance_inicial.eq.0");
  }
  await admin.from("trading_sync_tokens").update({ last_sync_at: ahora }).eq("account_id", t.account_id);

  // Reglas en vivo (22 nov 2026): el guardián recibe las reglas vigentes en cada
  // sincronización, así lo que se cambia en la web o en el chat llega a MT5 sin
  // volver a descargar el archivo. Primero se aplican los cambios "desde mañana"
  // que ya vencieron.
  // Reglas cambiadas desde el panel de MT5 (4.0): se guardan ANTES de armar el cfg,
  // así el guardián recibe en esta misma respuesta las reglas que quedaron vigentes.
  let setmsg = "";
  if (body?.set && typeof body.set === "object") {
    const cambios = cambiosDesdeMT5(body.set as Record<string, unknown>);
    if (!cambios) setmsg = "No se guardaron: revisa los numeros.";
    else {
      try {
        const { data: existe } = await admin.from("risk_rules").select("owner_id").eq("owner_id", t.owner_id).maybeSingle();
        // primera vez desde MT5: todos los activos y stop por ATR (la línea de Stop Loss manda)
        const base = existe ? {} : { guard_symbol: "*", guard_sl_mode: "atr" };
        const r = await guardarReglas(admin, t.owner_id, { ...base, ...cambios }, "mt5");
        if (!r.ok) setmsg = `No se guardaron: ${r.error ?? "error"}`;
        else if (!r.ahora.length && !r.manana.length) setmsg = "Guardado. No habia cambios.";
        else
          setmsg =
            "Guardado." +
            (r.ahora.length ? ` Ya aplica: ${r.ahora.join(", ")}.` : "") +
            (r.manana.length ? ` Desde manana: ${r.manana.join(", ")}.` : "");
      } catch {
        setmsg = "No se pudieron guardar. Intenta otra vez.";
      }
    }
    setmsg = ascii(setmsg);
  }

  let cfg = "";
  try {
    await aplicarPendientes(admin, t.owner_id);
    const [{ data: rr }, { data: ac }] = await Promise.all([
      admin.from("risk_rules").select("*").eq("owner_id", t.owner_id).maybeSingle(),
      admin.from("trading_accounts").select("tipo").eq("id", t.account_id).maybeSingle(),
    ]);
    if (rr) cfg = cfgGuardian(rr as Record<string, unknown>, Date.now(), { demo: ac?.tipo === "demo" });
  } catch {
    cfg = "";
  }

  // Avisos al celular (guardián 3.25+ manda open/lock/events; con versiones viejas
  // solo salen los de trades cerrados).
  await avisosTrading(admin, t, body as Record<string, unknown>, nuevos);

  return NextResponse.json({ ok: true, recibidos: filas.length, cfg, ...(setmsg ? { setmsg } : {}) });
}
