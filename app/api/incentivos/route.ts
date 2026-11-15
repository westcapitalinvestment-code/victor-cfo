import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { evaluarIncentivosEntidad } from "@/lib/incentivos-server";
import { INDUSTRIAS } from "@/lib/incentivos";

export const dynamic = "force-dynamic";

// Incentivos de PR para una entidad del dueño (15 nov 2026).
// GET   ?entity=ID          → evaluación (podría cualificar / falta dato / no aplica)
// PATCH {entity, ...datos}  → guarda industria, fecha de inicio, clientes fuera de PR y edad
// POST  {entity, incentivo, descartar} → oculta (o vuelve a mostrar) un incentivo
// Solo el dueño de la entidad (owner_id = user.id); RLS lo refuerza.

async function usuario() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const entity = req.nextUrl.searchParams.get("entity");
  if (!entity) return NextResponse.json({ error: "Falta la entidad." }, { status: 400 });
  const r = await evaluarIncentivosEntidad(supabase, user.id, entity);
  if (!r) return NextResponse.json({ error: "No disponible." }, { status: 404 });
  return NextResponse.json(r);
}

export async function PATCH(req: NextRequest) {
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const entity = typeof body?.entity === "string" ? body.entity : "";
  if (!entity) return NextResponse.json({ error: "Falta la entidad." }, { status: 400 });

  const cambios: Record<string, unknown> = {};
  if (body.industria !== undefined) {
    if (body.industria !== null && !INDUSTRIAS.some((i) => i.id === body.industria)) {
      return NextResponse.json({ error: "Industria inválida." }, { status: 400 });
    }
    cambios.industria = body.industria;
  }
  if (body.fecha_inicio !== undefined) {
    if (body.fecha_inicio !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha_inicio))) {
      return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
    }
    cambios.fecha_inicio_operaciones = body.fecha_inicio;
  }
  if (body.clientes_fuera_pr !== undefined) {
    if (body.clientes_fuera_pr !== null && typeof body.clientes_fuera_pr !== "boolean") {
      return NextResponse.json({ error: "Dato inválido." }, { status: 400 });
    }
    cambios.clientes_fuera_pr = body.clientes_fuera_pr;
  }
  if (body.ya_tuvo_ventas !== undefined) {
    if (body.ya_tuvo_ventas !== null && typeof body.ya_tuvo_ventas !== "boolean") {
      return NextResponse.json({ error: "Dato inválido." }, { status: 400 });
    }
    cambios.ya_tuvo_ventas = body.ya_tuvo_ventas;
  }
  if (Object.keys(cambios).length) {
    const { error } = await supabase.from("business_entities").update(cambios).eq("id", entity).eq("owner_id", user.id);
    if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
  if (body.edad !== undefined) {
    const edad = Number(body.edad);
    if (!Number.isInteger(edad) || edad < 14 || edad > 110) return NextResponse.json({ error: "Edad inválida." }, { status: 400 });
    const { error } = await supabase.from("user_profiles").update({ edad }).eq("id", user.id);
    if (error) return NextResponse.json({ error: "No se pudo guardar la edad." }, { status: 500 });
  }

  const r = await evaluarIncentivosEntidad(supabase, user.id, entity);
  return NextResponse.json(r ?? { ok: true });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const entity = typeof body?.entity === "string" ? body.entity : "";
  const incentivo = typeof body?.incentivo === "string" ? body.incentivo : "";
  if (!entity || !incentivo) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { data: ent } = await supabase.from("business_entities").select("id").eq("id", entity).eq("owner_id", user.id).maybeSingle();
  if (!ent) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const { error } = body.descartar === false
    ? await supabase.from("incentivos_descartados").delete().eq("entity_id", entity).eq("incentivo_id", incentivo)
    : await supabase.from("incentivos_descartados").upsert({ owner_id: user.id, entity_id: entity, incentivo_id: incentivo });
  if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
