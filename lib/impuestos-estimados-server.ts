import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcularEstimado,
  PERFIL_POR_DEFECTO,
  type DatosImpuestos,
  type PerfilImpuestos,
  type ResultadoEstimado,
  type Tramo,
} from "@/lib/impuestos-estimados";

// Lado servidor del estimado de impuestos (8 oct 2026) — lee tax_brackets /
// tax_params / tax_estimate_settings (migración 0144) y las transacciones
// del año a la fecha, y le pasa todo a calcularEstimado(). La aritmética
// vive en lib/impuestos-estimados.ts (pura, sin Supabase).
//
// Nunca lanza: si falta la migración o cualquier consulta falla, devuelve
// null y el Inicio simplemente no muestra la tarjeta — el estimado de
// impuestos jamás debe tumbar la página principal.

type FilaTramo = { jurisdiccion: string; anio: number; estatus: string; desde: number | string; tasa: number | string };
type FilaParam = { jurisdiccion: string; anio: number; clave: string; valor: number | string };

// Toma, para cada (jurisdicción, estatus), las filas del año más reciente
// que sea <= al año actual — así el año siguiente se activa solo cuando se
// insertan sus filas, sin tocar código.
function ultimoAnioDisponible(anios: number[], anioActual: number): number | null {
  const validos = anios.filter((a) => a <= anioActual);
  return validos.length > 0 ? Math.max(...validos) : null;
}

async function cargarDatos(supabase: SupabaseClient, anioActual: number): Promise<DatosImpuestos | null> {
  const [{ data: tramos, error: e1 }, { data: params, error: e2 }] = await Promise.all([
    supabase.from("tax_brackets").select("jurisdiccion, anio, estatus, desde, tasa").lte("anio", anioActual),
    supabase.from("tax_params").select("jurisdiccion, anio, clave, valor").lte("anio", anioActual),
  ]);
  if (e1 || e2 || !tramos || !params || tramos.length === 0) return null;

  const filasTramo = tramos as FilaTramo[];
  const filasParam = params as FilaParam[];

  const anioFed = ultimoAnioDisponible(filasTramo.filter((t) => t.jurisdiccion === "federal").map((t) => t.anio), anioActual);
  const anioPR = ultimoAnioDisponible(filasTramo.filter((t) => t.jurisdiccion === "pr").map((t) => t.anio), anioActual);
  if (anioFed === null || anioPR === null) return null;

  const tramosDe = (jur: string, anio: number, estatus: string): Tramo[] =>
    filasTramo
      .filter((t) => t.jurisdiccion === jur && t.anio === anio && t.estatus === estatus)
      .map((t) => ({ desde: Number(t.desde), tasa: Number(t.tasa) }))
      .sort((a, b) => a.desde - b.desde);

  const paramsDe = (jur: string, anio: number): Record<string, number> => {
    const out: Record<string, number> = {};
    // El año más reciente <= anio gana, parámetro por parámetro.
    const ordenados = filasParam.filter((p) => p.jurisdiccion === jur && p.anio <= anio).sort((a, b) => a.anio - b.anio);
    for (const p of ordenados) out[p.clave] = Number(p.valor);
    return out;
  };

  return {
    anioFederal: anioFed,
    anioPR,
    federal: {
      single: tramosDe("federal", anioFed, "single"),
      mfj: tramosDe("federal", anioFed, "mfj"),
      params: paramsDe("federal", anioFed),
    },
    pr: {
      individuo: tramosDe("pr", anioPR, "individuo"),
      corp_surtax: tramosDe("pr", anioPR, "corp_surtax"),
      params: paramsDe("pr", anioPR),
    },
  };
}

export async function cargarPerfilImpuestos(
  supabase: SupabaseClient,
  ownerId: string,
  entityId: string | null
): Promise<{ perfil: PerfilImpuestos; guardado: boolean }> {
  let q = supabase
    .from("tax_estimate_settings")
    .select("residencia, estatus, tipo, gastos_deducibles_pct, retenido_ytd, estimadas_pagadas_ytd")
    .eq("owner_id", ownerId);
  q = entityId ? q.eq("entity_id", entityId) : q.is("entity_id", null);
  const { data } = await q.maybeSingle();
  if (!data) return { perfil: { ...PERFIL_POR_DEFECTO }, guardado: false };
  return {
    guardado: true,
    perfil: {
      residencia: data.residencia === "us" ? "us" : "pr",
      estatus: data.estatus === "mfj" ? "mfj" : "single",
      tipo: data.tipo === "empleado" || data.tipo === "corporacion" ? data.tipo : "cuenta_propia",
      gastosDeduciblesPct: Number(data.gastos_deducibles_pct ?? 0),
      retenidoYTD: Number(data.retenido_ytd ?? 0),
      estimadasPagadasYTD: Number(data.estimadas_pagadas_ytd ?? 0),
    },
  };
}

type FilaTx = { amount: number | string; tipo_flujo: string | null; hacienda_category_id: number | null; fecha: string };

// Supabase corta en 1000 filas por consulta por defecto (ver #550: ese corte
// ya escondió meses enteros en Gastos) — se pagina para no subestimar el
// ingreso del año.
async function transaccionesDelAnio(
  supabase: SupabaseClient,
  ownerId: string,
  entityId: string | null,
  desde: string,
  hasta: string
): Promise<FilaTx[]> {
  const todas: FilaTx[] = [];
  const PAGINA = 1000;
  for (let i = 0; i < 20; i++) {
    let q = supabase
      .from("transactions")
      .select("amount, tipo_flujo, hacienda_category_id, fecha")
      .eq("owner_id", ownerId)
      .eq("es_duplicada", false)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .range(i * PAGINA, i * PAGINA + PAGINA - 1);
    q = entityId ? q.eq("entity_id", entityId) : q.is("entity_id", null);
    const { data, error } = await q;
    if (error || !data) break;
    todas.push(...(data as FilaTx[]));
    if (data.length < PAGINA) break;
  }
  return todas;
}

export interface EstimadoImpuestosCompleto {
  resultado: ResultadoEstimado;
  perfil: PerfilImpuestos;
  perfilGuardado: boolean;
  ingresosYTD: number;
  ingresoMesActual: number;
  anioDatosFederal: number;
  anioDatosPR: number;
}

export async function obtenerEstimadoImpuestos(
  supabase: SupabaseClient,
  ownerId: string,
  entityId: string | null,
  hoyStr: string
): Promise<EstimadoImpuestosCompleto | null> {
  try {
    const anio = Number(hoyStr.slice(0, 4));
    const datos = await cargarDatos(supabase, anio);
    if (!datos) return null;

    const { perfil, guardado } = await cargarPerfilImpuestos(supabase, ownerId, entityId);
    const txs = await transaccionesDelAnio(supabase, ownerId, entityId, `${anio}-01-01`, hoyStr);

    // Multiplicador de deducibilidad por categoría (ej. comidas 50%) — solo
    // se usa en Negocio. En Personal los gastos no son deducibles por
    // defecto (el usuario puede estimar un % en su perfil).
    let multiplicadores = new Map<number, number>();
    if (entityId) {
      const { data: cats } = await supabase.from("hacienda_categories").select("id, deducible_multiplier");
      multiplicadores = new Map((cats ?? []).map((c: { id: number; deducible_multiplier: number | string | null }) => [c.id, Number(c.deducible_multiplier ?? 1)]));
    }

    const mesActual = hoyStr.slice(0, 7);
    let ingresosYTD = 0;
    let ingresoMesActual = 0;
    let gastosDeduciblesYTD = 0;
    for (const t of txs) {
      const monto = Number(t.amount);
      if (t.tipo_flujo === "ingreso") {
        const v = Math.abs(monto);
        ingresosYTD += v;
        if (t.fecha.startsWith(mesActual)) ingresoMesActual += v;
      } else if (entityId && t.tipo_flujo === "gasto" && t.hacienda_category_id) {
        gastosDeduciblesYTD += monto * (multiplicadores.get(t.hacienda_category_id) ?? 1);
      }
    }

    const resultado = calcularEstimado({
      datos,
      perfil,
      ingresosYTD,
      gastosDeduciblesYTD,
      ingresoMesActual,
      hoyStr,
    });

    return {
      resultado,
      perfil,
      perfilGuardado: guardado,
      ingresosYTD,
      ingresoMesActual,
      anioDatosFederal: datos.anioFederal,
      anioDatosPR: datos.anioPR,
    };
  } catch (err) {
    console.error("obtenerEstimadoImpuestos falló (la tarjeta no se muestra):", err);
    return null;
  }
}
