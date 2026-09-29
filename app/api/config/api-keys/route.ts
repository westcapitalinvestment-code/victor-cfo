import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generarApiKey, type ApiKeyScope } from "@/lib/api-auth";

// Gestión de API keys desde Configuración → API/Integraciones (solo Pro).
// A diferencia de /api/v1/*, esta ruta SÍ usa la sesión normal de Supabase
// (cookie), no una API key — es la propia app la que administra sus keys.
//
// api_keys tiene RLS encendido sin políticas (igual que referral_rewards),
// así que hace falta el cliente admin aquí también, siempre filtrando a
// mano por owner_id = auth.uid() del usuario con sesión — nunca por nada
// que venga del body/query.

const SCOPES_V1: ApiKeyScope[] = ["clientes:leer", "clientes:escribir", "facturas:leer", "facturas:escribir"];

// GET: lista las API keys del usuario (nunca la key completa — solo lo que
// ya se guardó: prefijo, nombre, fechas, scopes).
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .select("id, entity_id, nombre, prefijo, scopes, created_at, last_used_at, revoked_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST: genera una API key nueva. La key completa se devuelve UNA vez en
// esta respuesta — el cliente debe mostrarla y nunca volver a pedirla (no
// se puede recuperar después, solo revocar y generar otra).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
  if (!esPro) return NextResponse.json({ error: "La API pública es una función de plan Pro." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
  if (!nombre) return NextResponse.json({ error: "Falta el nombre de la key." }, { status: 400 });

  const entityId = typeof body?.entity_id === "string" && body.entity_id ? body.entity_id : null;
  if (entityId) {
    const { data: entidad } = await supabase
      .from("business_entities")
      .select("id")
      .eq("id", entityId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!entidad) return NextResponse.json({ error: "entity_id inválido." }, { status: 400 });
  }

  // v1 siempre da los 4 scopes fijos — no hay UI todavía para elegir un
  // subconjunto (se puede agregar después sin migración, la columna ya es
  // un array de texto libre).
  const scopes = SCOPES_V1;

  const { key, keyHash, prefijo } = generarApiKey();

  const admin = createAdminClient();
  const { data: fila, error } = await admin
    .from("api_keys")
    .insert({
      owner_id: user.id,
      entity_id: entityId,
      nombre,
      prefijo,
      key_hash: keyHash,
      scopes,
    })
    .select("id, entity_id, nombre, prefijo, scopes, created_at")
    .maybeSingle();

  if (error || !fila) {
    return NextResponse.json({ error: error?.message ?? "No se pudo crear la API key." }, { status: 500 });
  }

  return NextResponse.json({ data: { ...fila, key } }, { status: 201 });
}
