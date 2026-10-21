import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNomina, registrarNomina } from "@/lib/nomina-server";

// Tasas propias de la entidad: SUTA (la asigna el DTRH), CFSE (por póliza) y si
// aplica FUTA. Las tasas generales (FICA, SINOT, topes) viven en payroll_params.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  const a = await actorNomina(supabase, entityId, { soloPermisos: true });
  if ("error" in a) return a.error;
  const { g } = a;
  const { data } = await g.db.from("payroll_entity_config").select("*").eq("entity_id", entityId).maybeSingle();
  return NextResponse.json({ ok: true, config: data ?? null });
}

const tasa = (v: unknown, max: number): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error("Tasa fuera de rango.");
  return n;
};

export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  const entityId = String(body.entityId ?? "");
  // Un dueño sin Nómina activa puede igual autorizar a su contable (el contable
  // siempre tiene Nómina); en ese caso el cuerpo solo trae los interruptores.
  const soloPermisos = Object.keys(body).every((k) => ["entityId", "cpa_puede_nomina", "cpa_aprueba_directo"].includes(k));
  const a = await actorNomina(supabase, entityId, { soloPermisos });
  if ("error" in a) return a.error;
  const { g } = a;
  // Los interruptores del contable los decide SOLO el dueño.
  const tocaInterruptores = body.cpa_puede_nomina !== undefined || body.cpa_aprueba_directo !== undefined;
  if (tocaInterruptores && g.actor !== "dueno") {
    return NextResponse.json({ error: "Solo el dueño puede cambiar los permisos del contable." }, { status: 403 });
  }
  let sutaTasa: number | null | undefined;
  let cfseTasa: number | null | undefined;
  try {
    // El formulario manda porcentajes (ej. 2.5); se guardan como fracción (0.025).
    const s = body.suta_pct === undefined ? undefined : body.suta_pct === null || body.suta_pct === "" ? null : Number(body.suta_pct) / 100;
    const c = body.cfse_pct === undefined ? undefined : body.cfse_pct === null || body.cfse_pct === "" ? null : Number(body.cfse_pct) / 100;
    sutaTasa = tasa(s, 0.2);
    cfseTasa = tasa(c, 0.5);
  } catch {
    return NextResponse.json({ error: "Escribe un porcentaje válido." }, { status: 400 });
  }
  const fila: Record<string, unknown> = { entity_id: entityId, owner_id: g.userId, updated_at: new Date().toISOString() };
  if (sutaTasa !== undefined) fila.suta_tasa = sutaTasa;
  if (cfseTasa !== undefined) fila.cfse_tasa = cfseTasa;
  if (body.cfse_poliza !== undefined) fila.cfse_poliza = String(body.cfse_poliza ?? "").slice(0, 60) || null;
  if (body.cfse_codigo_riesgo !== undefined) fila.cfse_codigo_riesgo = String(body.cfse_codigo_riesgo ?? "").slice(0, 60) || null;
  if (body.futa_aplica !== undefined) fila.futa_aplica = !!body.futa_aplica;
  if (body.cpa_puede_nomina !== undefined) fila.cpa_puede_nomina = !!body.cpa_puede_nomina;
  if (body.cpa_aprueba_directo !== undefined) fila.cpa_aprueba_directo = !!body.cpa_aprueba_directo;
  // Bono de Navidad (vacío = sugerencia por defecto). El % llega como porcentaje (6 → 0.06).
  const numOpc = (v: unknown, max: number): number | null | "mal" => {
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : "mal";
  };
  const mmdd = (v: unknown): string | null | "mal" => {
    if (v === null || v === "") return null;
    return /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(String(v)) ? String(v) : "mal";
  };
  if (body.bono_activo !== undefined) fila.bono_activo = !!body.bono_activo;
  const bPct = body.bono_pct === undefined ? undefined : numOpc(body.bono_pct, 100);
  const bTope = body.bono_tope === undefined ? undefined : numOpc(body.bono_tope, 1_000_000);
  const bHoras = body.bono_horas_min === undefined ? undefined : numOpc(body.bono_horas_min, 10_000);
  const bIni = body.bono_inicio === undefined ? undefined : mmdd(body.bono_inicio);
  const bFin = body.bono_fin === undefined ? undefined : mmdd(body.bono_fin);
  const bPago = body.bono_fecha_pago === undefined ? undefined : mmdd(body.bono_fecha_pago);
  if ([bPct, bTope, bHoras, bIni, bFin, bPago].includes("mal")) {
    return NextResponse.json({ error: "Revisa los valores del Bono de Navidad (porcentaje, monto, horas y fechas MM-DD)." }, { status: 400 });
  }
  if (bPct !== undefined) fila.bono_pct = bPct === null ? null : (bPct as number) / 100;
  if (bTope !== undefined) fila.bono_tope = bTope;
  if (bHoras !== undefined) fila.bono_horas_min = bHoras;
  if (bIni !== undefined) fila.bono_inicio = bIni;
  if (bFin !== undefined) fila.bono_fin = bFin;
  if (bPago !== undefined) fila.bono_fecha_pago = bPago;
  // Sin permiso para operar no tiene sentido "aprobar directo".
  if (fila.cpa_puede_nomina === false) fila.cpa_aprueba_directo = false;
  const { data, error } = await g.db.from("payroll_entity_config").upsert(fila, { onConflict: "entity_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await registrarNomina(g, entityId, tocaInterruptores ? "permisos_contable_cambiados" : "tasas_actualizadas", {
    ...(tocaInterruptores ? { cpa_puede_nomina: data.cpa_puede_nomina, cpa_aprueba_directo: data.cpa_aprueba_directo } : {}),
  });
  return NextResponse.json({ ok: true, config: data });
}
