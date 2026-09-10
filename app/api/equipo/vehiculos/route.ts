import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// CRUD de vehículos por placa (10 sept 2026, migración 0082) — registro
// simple para que los cruces de peaje importados se puedan vincular a un
// carro específico automáticamente.
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const entityId = new URL(req.url).searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "Falta entityId." }, { status: 400 });

  const { data: vehiculos, error } = await supabase
    .from("vehiculos")
    .select("id, placa, alias, activo")
    .eq("owner_id", user.id)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, vehiculos: vehiculos ?? [] });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const entityId = body?.entityId as string | undefined;
  const placa = String(body?.placa ?? "").trim().toUpperCase();
  const alias = body?.alias ? String(body.alias).trim() : null;

  if (!entityId) return NextResponse.json({ error: "Falta entityId." }, { status: 400 });
  if (!placa) return NextResponse.json({ error: "Falta la placa." }, { status: 400 });

  const { data: entidad } = await supabase.from("business_entities").select("id").eq("id", entityId).eq("owner_id", user.id).maybeSingle();
  if (!entidad) return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });

  const { data: vehiculo, error } = await supabase
    .from("vehiculos")
    .insert({ owner_id: user.id, entity_id: entityId, placa, alias })
    .select("id, placa, alias, activo")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: `La placa "${placa}" ya está registrada.` }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, vehiculo });
}
