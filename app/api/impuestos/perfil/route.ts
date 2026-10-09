import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Guarda los datos que ajustan el estimado de impuestos del Inicio (8 oct
// 2026): dónde reside, estatus, tipo de contribuyente, y lo que el usuario
// ya pagó/le han retenido. Un perfil por usuario y por entidad (entityId
// null = Personal). Ver migración 0144 y lib/impuestos-estimados.ts.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });

  const entityId: string | null = typeof body.entityId === "string" && body.entityId ? body.entityId : null;
  const residencia = body.residencia === "us" ? "us" : body.residencia === "pr" ? "pr" : null;
  const estatus = body.estatus === "mfj" ? "mfj" : body.estatus === "single" ? "single" : null;
  const tipo =
    body.tipo === "empleado" || body.tipo === "corporacion" || body.tipo === "cuenta_propia" ? body.tipo : null;
  if (!residencia || !estatus || !tipo) {
    return NextResponse.json({ error: "Faltan datos: residencia, estatus o tipo." }, { status: 400 });
  }

  const numero = (v: unknown, max: number): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
  };
  const gastosPct = numero(body.gastosDeduciblesPct ?? 0, 100);
  const retenido = numero(body.retenidoYTD ?? 0, 100_000_000);
  const estimadas = numero(body.estimadasPagadasYTD ?? 0, 100_000_000);
  if (gastosPct === null || retenido === null || estimadas === null) {
    return NextResponse.json({ error: "Los montos tienen que ser números válidos (el porcentaje, de 0 a 100)." }, { status: 400 });
  }

  // La entidad tiene que ser del usuario que llama.
  if (entityId) {
    const { data: ent } = await supabase
      .from("business_entities")
      .select("id")
      .eq("id", entityId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!ent) return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }

  const fila = {
    residencia,
    estatus,
    tipo,
    gastos_deducibles_pct: gastosPct,
    retenido_ytd: retenido,
    estimadas_pagadas_ytd: estimadas,
    updated_at: new Date().toISOString(),
  };

  // El índice único usa COALESCE(entity_id, ...) así que un upsert directo
  // no puede apuntarle — se busca primero y se actualiza o inserta.
  let q = supabase.from("tax_estimate_settings").select("id").eq("owner_id", user.id);
  q = entityId ? q.eq("entity_id", entityId) : q.is("entity_id", null);
  const { data: existente } = await q.maybeSingle();

  const { error } = existente
    ? await supabase.from("tax_estimate_settings").update(fila).eq("id", existente.id).eq("owner_id", user.id)
    : await supabase.from("tax_estimate_settings").insert({ ...fila, owner_id: user.id, entity_id: entityId });

  if (error) {
    return NextResponse.json({ error: "No se pudo guardar: " + error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
