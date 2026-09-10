import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// CRUD de "tipos de gasto con evidencia requerida" por entidad (10 sept
// 2026) — configurable a propósito, no hardcodeado a "gasolina" (ver
// migración 0081). El dueño arma su propia lista (Gasolina/Peajes,
// Materiales, Viáticos...) y opcionalmente la vincula a una categoría de
// Hacienda para que la reconciliación automática sepa qué comparar.
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const entityId = new URL(req.url).searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "Falta entityId." }, { status: 400 });

  const { data: tipos, error } = await supabase
    .from("expense_evidence_types")
    .select("id, nombre, hacienda_category_id, tolerancia_monto, ventana_dias, activo, hacienda_categories(nombre)")
    .eq("owner_id", user.id)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tipos: tipos ?? [] });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const entityId = body?.entityId as string | undefined;
  const nombre = String(body?.nombre ?? "").trim();
  const haciendaCategoryId = body?.haciendaCategoryId ? String(body.haciendaCategoryId) : null;
  const toleranciaMonto = Number(body?.toleranciaMonto ?? 5);
  const ventanaDias = Number(body?.ventanaDias ?? 3);

  if (!entityId) return NextResponse.json({ error: "Falta entityId." }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "Falta el nombre del tipo de gasto." }, { status: 400 });
  if (nombre.length > 60) return NextResponse.json({ error: "El nombre es muy largo (máximo 60 caracteres)." }, { status: 400 });

  // Confirma que la entidad es del usuario antes de escribir — RLS de
  // business_entities ya lo exige, pero da un mensaje claro en vez de un
  // error críptico de FK/RLS si alguien manipula el entityId.
  const { data: entidad } = await supabase.from("business_entities").select("id").eq("id", entityId).eq("owner_id", user.id).maybeSingle();
  if (!entidad) return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });

  const { data: tipo, error } = await supabase
    .from("expense_evidence_types")
    .insert({
      owner_id: user.id,
      entity_id: entityId,
      nombre,
      hacienda_category_id: haciendaCategoryId,
      tolerancia_monto: Number.isFinite(toleranciaMonto) ? toleranciaMonto : 5,
      ventana_dias: Number.isFinite(ventanaDias) ? ventanaDias : 3,
    })
    .select("id, nombre, hacienda_category_id, tolerancia_monto, ventana_dias, activo")
    .single();

  if (error || !tipo) return NextResponse.json({ error: error?.message ?? "No se pudo crear el tipo de gasto." }, { status: 500 });
  return NextResponse.json({ ok: true, tipo });
}
