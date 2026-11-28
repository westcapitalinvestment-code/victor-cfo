import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clasificarCambios,
  columnasDeGrupo,
  ETIQUETA_CAMPO,
  fechaLocal,
  normalizarBloqueos,
  bloqueosAColumnas,
  utcDeLocal,
  type FilaReglas,
} from "./trading-bloqueos";

// Guardar reglas de trading con la regla de oro (22 nov 2026, pedido de Joel):
// APRETAR una regla aplica al instante; AFLOJARLA aplica desde mañana (medianoche
// en la hora de la persona). Lo usan la web (/api/trading/reglas), el chat de
// VICTOR y la sincronización del guardián (que aplica los pendientes que vencieron).
// Desde el guardián 4.0 también el panel "Reglas" de MT5 (origen "mt5").

// Columnas de risk_rules que se pueden cambiar
const EDITABLES = new Set([
  "riesgo_por_trade_pct", "max_perdedores_dia", "perdida_max_dia_pct", "max_trades_dia", "espera_tras_perdida_min", "duracion_min_seg", "sl_obligatorio",
  "guard_symbol", "guard_sl_pips", "guard_pip_size", "guard_reward_ratio", "guard_max_open", "guard_daily_loss_usd", "guard_min_equity_usd",
  "guard_lock_mode", "guard_block_manual_close", "guard_sl_mode", "guard_sl_pct", "guard_atr_mult", "guard_atr_tf", "guard_blocked_symbols", "guard_pip_symbol",
  "zona_horaria", "horario_ventanas", "horario_sesiones", "dias_bloqueados", "pausas", "noticias_min",
  "prueba_inicio", "prueba_dias", "prueba_avisada", "prueba_revisada",
]);

export type Origen = "web" | "chat" | "plan" | "mt5";
export type ResultadoGuardar = {
  ok: boolean;
  error?: string;
  ahora: string[]; // etiquetas de lo que aplicó ya
  manana: string[]; // etiquetas de lo que aplica desde mañana
  aplicarDesde: string | null; // ISO
};

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function limpiar(cambios: FilaReglas): FilaReglas {
  const out: FilaReglas = {};
  for (const [k, v] of Object.entries(cambios)) if (EDITABLES.has(k) && v !== undefined) out[k] = v;
  // los bloqueos siempre se guardan normalizados
  const tocaBloqueos = ["zona_horaria", "horario_ventanas", "horario_sesiones", "dias_bloqueados", "pausas", "noticias_min"].some((k) => k in out);
  if (tocaBloqueos) {
    const b = bloqueosAColumnas(normalizarBloqueos(out));
    for (const k of Object.keys(b) as (keyof typeof b)[]) if (k in out) out[k] = b[k];
  }
  return out;
}

// Aplica los cambios pendientes cuya fecha ya llegó. Devuelve cuántos aplicó.
export async function aplicarPendientes(db: SupabaseClient, ownerId: string): Promise<number> {
  const { data: pend } = await db
    .from("trading_reglas_cambios")
    .select("id, cambios, aplicar_desde")
    .eq("owner_id", ownerId)
    .eq("estado", "pendiente")
    .lte("aplicar_desde", new Date().toISOString())
    .order("created_at");
  if (!pend?.length) return 0;
  const fila: FilaReglas = {};
  for (const p of pend as { cambios: Record<string, { despues: unknown }> }[]) {
    for (const [k, v] of Object.entries(p.cambios ?? {})) if (EDITABLES.has(k)) fila[k] = v?.despues;
  }
  const { error } = await db.from("risk_rules").upsert({ owner_id: ownerId, ...fila, updated_at: new Date().toISOString() });
  if (error) return 0;
  await db
    .from("trading_reglas_cambios")
    .update({ estado: "aplicado", aplicado_at: new Date().toISOString() })
    .in("id", (pend as { id: string }[]).map((p) => p.id));
  return pend.length;
}

export async function guardarReglas(db: SupabaseClient, ownerId: string, cambiosIn: FilaReglas, origen: Origen): Promise<ResultadoGuardar> {
  await aplicarPendientes(db, ownerId);
  const cambios = limpiar(cambiosIn);
  const { data: rr } = await db.from("risk_rules").select("*").eq("owner_id", ownerId).maybeSingle();
  const actual = (rr ?? null) as FilaReglas | null;

  // Primera vez (no tenía reglas): todo aplica ya.
  const clas = actual ? clasificarCambios(actual, cambios) : { aprieta: [], afloja: [], igual: [] };
  const colsFlojas = new Set(clas.afloja.flatMap(columnasDeGrupo));

  const ya: FilaReglas = {};
  const despues: Record<string, { antes: unknown; despues: unknown }> = {};
  for (const [k, v] of Object.entries(cambios)) {
    if (actual && igual(actual[k], v)) continue;
    if (colsFlojas.has(k)) despues[k] = { antes: actual?.[k] ?? null, despues: v };
    else ya[k] = v;
  }

  // Lo que se toca ahora (en cualquier sentido) anula lo pendiente de esos mismos campos.
  const tocados = new Set([...Object.keys(ya), ...Object.keys(despues)]);
  if (tocados.size) {
    const { data: pend } = await db.from("trading_reglas_cambios").select("id, cambios").eq("owner_id", ownerId).eq("estado", "pendiente");
    for (const p of (pend ?? []) as { id: string; cambios: Record<string, unknown> }[]) {
      const resto = Object.fromEntries(Object.entries(p.cambios ?? {}).filter(([k]) => !tocados.has(k)));
      if (Object.keys(resto).length === Object.keys(p.cambios ?? {}).length) continue;
      await db
        .from("trading_reglas_cambios")
        .update(Object.keys(resto).length ? { cambios: resto } : { estado: "cancelado" })
        .eq("id", p.id);
    }
  }

  if (Object.keys(ya).length || !actual) {
    const { error } = await db.from("risk_rules").upsert({ owner_id: ownerId, ...ya, updated_at: new Date().toISOString() });
    if (error) return { ok: false, error: `No se pudieron guardar las reglas: ${error.message}`, ahora: [], manana: [], aplicarDesde: null };
    const hist = Object.fromEntries(Object.entries(ya).map(([k, v]) => [k, { antes: actual?.[k] ?? null, despues: v }]));
    if (Object.keys(hist).length)
      await db.from("trading_reglas_cambios").insert({ owner_id: ownerId, cambios: hist, estado: "aplicado", aplicado_at: new Date().toISOString(), origen });
  }

  let aplicarDesde: string | null = null;
  if (Object.keys(despues).length) {
    const zona = normalizarBloqueos(actual ?? {}).zona;
    const manana = fechaLocal(zona, Date.now() + 86400000);
    aplicarDesde = new Date(utcDeLocal(zona, manana)).toISOString();
    const { error } = await db
      .from("trading_reglas_cambios")
      .insert({ owner_id: ownerId, cambios: despues, estado: "pendiente", aplicar_desde: aplicarDesde, origen });
    if (error) return { ok: false, error: `No se pudo programar el cambio para mañana: ${error.message}`, ahora: [], manana: [], aplicarDesde: null };
  }

  const etiquetas = (cols: string[]) => {
    const g = new Set<string>();
    for (const c of cols) {
      if (["zona_horaria", "horario_ventanas", "horario_sesiones", "dias_bloqueados"].includes(c)) g.add(ETIQUETA_CAMPO.horario);
      else if (ETIQUETA_CAMPO[c]) g.add(ETIQUETA_CAMPO[c]);
    }
    return [...g];
  };
  return { ok: true, ahora: etiquetas(Object.keys(ya)), manana: etiquetas(Object.keys(despues)), aplicarDesde };
}

export type Pendiente = { id: string; cambios: Record<string, { antes: unknown; despues: unknown }>; aplicar_desde: string; origen: string };

export async function listarPendientes(db: SupabaseClient, ownerId: string): Promise<Pendiente[]> {
  const { data } = await db
    .from("trading_reglas_cambios")
    .select("id, cambios, aplicar_desde, origen")
    .eq("owner_id", ownerId)
    .eq("estado", "pendiente")
    .order("created_at");
  return (data ?? []) as Pendiente[];
}

export async function cancelarPendiente(db: SupabaseClient, ownerId: string, id: string): Promise<boolean> {
  const { error } = await db.from("trading_reglas_cambios").update({ estado: "cancelado" }).eq("id", id).eq("owner_id", ownerId).eq("estado", "pendiente");
  return !error;
}

// Texto corto de un valor para mostrar ("4 trades", "8:00 am a 2:00 pm", …)
export function textoValor(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "sin límite";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (campo === "horario_ventanas" && Array.isArray(v)) return v.length ? v.map((x) => `${x.ini}–${x.fin}`).join(", ") : "sin límite";
  if (campo === "horario_sesiones" && Array.isArray(v)) return v.length ? v.join(", ") : "sin límite";
  if (campo === "dias_bloqueados" && Array.isArray(v))
    return v.length ? v.map((d) => ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][Number(d)] ?? d).join(", ") : "ninguno";
  if (campo === "pausas" && Array.isArray(v)) return v.length ? v.map((p) => `${p.desde}→${p.hasta}`).join(", ") : "ninguna";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
