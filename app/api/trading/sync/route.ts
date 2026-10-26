import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (token.length < 32 || token.length > 128) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  const admin = createAdminClient();
  const { data: t } = await admin.from("trading_sync_tokens").select("account_id, owner_id").eq("token", token).maybeSingle();
  if (!t) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

  const lista = Array.isArray(body?.trades) ? body.trades.slice(0, 200) : [];
  const filas: Record<string, unknown>[] = [];
  for (const x of lista) {
    const apertura = fecha(x?.open_time);
    const lado = x?.side === "sell" ? "sell" : x?.side === "buy" ? "buy" : null;
    const ticket = typeof x?.ticket === "string" || typeof x?.ticket === "number" ? String(x.ticket).slice(0, 40) : "";
    const simbolo = typeof x?.symbol === "string" ? x.symbol.replace(/[^A-Za-z0-9._]/g, "").slice(0, 20) : "";
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
    });
  }
  if (filas.length) {
    const { error } = await admin.from("trades").upsert(filas, { onConflict: "account_id,ticket", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: "No se pudieron guardar los trades." }, { status: 500 });
  }

  const ahora = new Date().toISOString();
  const cuenta: Record<string, unknown> = { last_sync_at: ahora };
  if (typeof body?.balance === "number" && Number.isFinite(body.balance)) cuenta.balance_actual = body.balance;
  if (typeof body?.equity === "number" && Number.isFinite(body.equity)) cuenta.equity_actual = body.equity;
  await admin.from("trading_accounts").update(cuenta).eq("id", t.account_id);
  await admin.from("trading_sync_tokens").update({ last_sync_at: ahora }).eq("account_id", t.account_id);

  return NextResponse.json({ ok: true, recibidos: filas.length });
}
