import type { SupabaseClient } from "@supabase/supabase-js";
import { notificarOwner, type PayloadNotificacion } from "@/lib/push";

// Avisos al celular del guardián (25 nov 2026). Salen de la sincronización con MT5
// (cada ~30 s): trade abierto con su riesgo y lo que queda del día, trade cerrado,
// "te queda 1 pérdida", bloqueo del día y lo que el guardián cerró o no dejó hacer.
// Solo informan: no dan señales ni recomiendan operar. Best-effort: nunca lanza.

type Cerrado = { ticket: string; simbolo: string; ganancia: number; comision: number; swap: number };
type Abierto = { ticket: string; symbol: string; side: string; volume: number; risk?: number };

const din = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const limpio = (v: unknown, max = 300) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
const URL_TRADING = "/dashboard/trading";

export async function avisosTrading(
  admin: SupabaseClient,
  t: { account_id: string; owner_id: string },
  body: Record<string, unknown>,
  cerrados: Cerrado[]
): Promise<void> {
  try {
    // Sin celular suscrito no hay a quién avisar: no se toca la base de datos.
    const [{ count: web }, { count: nativos }] = await Promise.all([
      admin.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("owner_id", t.owner_id),
      admin.from("native_push_tokens").select("id", { count: "exact", head: true }).eq("owner_id", t.owner_id),
    ]);
    if (!web && !nativos) return;

    // Marca el aviso como enviado; devuelve true solo la primera vez.
    const primeraVez = async (clave: string) => {
      const { data } = await admin
        .from("trading_avisos")
        .upsert({ account_id: t.account_id, clave: clave.slice(0, 120) }, { onConflict: "account_id,clave", ignoreDuplicates: true })
        .select("clave");
      return (data?.length ?? 0) > 0;
    };

    const avisos: PayloadNotificacion[] = [];
    const left = typeof body.left === "number" && body.left >= 0 ? body.left : null;
    const losers = typeof body.losers === "number" ? body.losers : null;
    const maxl = typeof body.maxl === "number" && body.maxl > 0 ? body.maxl : null;
    const quedaTxt = left !== null ? ` Te quedan ${din(left)} para perder hoy.` : "";

    // 1) Trades abiertos (uno por ticket)
    const abiertos = (Array.isArray(body.open) ? body.open : []).slice(0, 20) as Abierto[];
    for (const a of abiertos) {
      const ticket = limpio(String(a?.ticket ?? ""), 40);
      const sim = limpio(a?.symbol, 20);
      if (!ticket || !sim) continue;
      if (!(await primeraVez(`open:${ticket}`))) continue;
      const lado = a.side === "sell" ? "Venta" : "Compra";
      const vol = Number(a.volume);
      const riesgo = Number(a.risk);
      avisos.push({
        title: `Trade abierto · ${sim}`,
        body: `${lado} ${Number.isFinite(vol) ? vol.toFixed(2) : ""} lotes${Number.isFinite(riesgo) && riesgo > 0 ? ` · arriesgas ${din(riesgo)}` : ""}.${quedaTxt}`,
        url: URL_TRADING,
      });
    }

    // 2) Trades cerrados nuevos. Si llegan muchos de golpe (cuenta recién conectada
    // que sube su historial) no se avisa nada para no llenar el celular.
    if (cerrados.length > 0 && cerrados.length <= 3) {
      for (const c of cerrados) {
        const neto = Number(c.ganancia) + Number(c.comision) + Number(c.swap);
        if (!Number.isFinite(neto)) continue;
        let texto: string;
        if (neto < 0 && losers !== null && maxl !== null && losers < maxl) {
          const quedan = maxl - losers;
          texto =
            quedan === 1
              ? `Pérdidas hoy: ${losers} de ${maxl}. Te queda 1: si la próxima sale mal, VictorGuard te bloquea hasta mañana.`
              : `Pérdidas hoy: ${losers} de ${maxl}.${quedaTxt}`;
        } else if (neto < 0) {
          texto = `Pérdida registrada.${quedaTxt}`;
        } else {
          texto = `Bien manejado.${quedaTxt}`;
        }
        avisos.push({ title: `Cerraste ${c.simbolo} en ${neto < 0 ? "-" : "+"}${din(neto)}`, body: texto, url: URL_TRADING });
      }
    }

    // 3) Bloqueo del día (pérdidas, pérdida máxima, piso, cierre manual): una vez por día y motivo
    const lock = limpio(body.lock);
    if (lock) {
      const dia = new Date().toISOString().slice(0, 10);
      if (await primeraVez(`lock:${dia}:${lock.slice(0, 60)}`)) {
        avisos.push({ title: "VictorGuard te bloqueó por hoy", body: cap(lock), url: URL_TRADING });
      }
    }

    // 4) Lo que el guardián cerró o no dejó hacer (el guardián los manda una sola vez)
    const eventos = (Array.isArray(body.events) ? body.events : []).slice(0, 5);
    for (const e of eventos) {
      const s = limpio(e);
      if (s) avisos.push({ title: "VictorGuard te protegió", body: s, url: URL_TRADING });
    }

    for (const a of avisos.slice(0, 8)) await notificarOwner(t.owner_id, a);
  } catch {
    // Best-effort: un fallo aquí nunca debe romper la sincronización.
  }
}
