import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autenticarApiKey, tieneScope } from "@/lib/api-auth";

// API pública v1 — Clientes. Ver API.md en la raíz del proyecto.
//
// Aislamiento total entre cuentas: TODA query filtra por owner_id de la key
// autenticada (nunca por nada que venga del request) y, si la key está
// atada a una entidad específica (entity_id no nulo), también por esa
// entidad — igual que el resto de la app (mismo criterio "entity_id.is.null
// OR entity_id.eq.X" que usa VICTOR/nueva-factura-form.tsx para clientes
// compartidos entre entidades).

export async function GET(request: Request) {
  const auth = await autenticarApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!tieneScope(auth.scopes, "clientes:leer")) {
    return NextResponse.json({ error: "Esta API key no tiene el scope 'clientes:leer'." }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 100);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const desde = (page - 1) * limit;
  const hasta = desde + limit - 1;

  const admin = createAdminClient();
  let query = admin
    .from("clients")
    .select(
      "id, name, email, telefono, tax_id, address, es_negocio, retention_pct, active, created_at",
      { count: "exact" }
    )
    .eq("owner_id", auth.ownerId)
    .order("created_at", { ascending: false })
    .range(desde, hasta);

  if (auth.entityId) {
    query = query.or(`entity_id.is.null,entity_id.eq.${auth.entityId}`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: (data ?? []).map((c) => ({
      id: c.id,
      nombre: c.name,
      email: c.email,
      telefono: c.telefono,
      tax_id: c.tax_id,
      direccion: c.address,
      es_negocio: c.es_negocio,
      retencion_pct: c.retention_pct,
      activo: c.active,
      creado: c.created_at,
    })),
    page,
    limit,
    total: count ?? 0,
  });
}

export async function POST(request: Request) {
  const auth = await autenticarApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!tieneScope(auth.scopes, "clientes:escribir")) {
    return NextResponse.json({ error: "Esta API key no tiene el scope 'clientes:escribir'." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido en el cuerpo de la request." }, { status: 400 });
  }

  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  if (!nombre) {
    return NextResponse.json({ error: "Falta 'nombre' (requerido)." }, { status: 400 });
  }

  // Mismos campos que app/dashboard/clientes/nuevo/nuevo-cliente-form.tsx —
  // solo 'nombre' es requerido, el resto es opcional.
  const esNegocio = Boolean(body.es_negocio);
  const retencionPct =
    esNegocio && typeof body.retencion_pct === "number" ? body.retencion_pct : esNegocio ? 10 : 0;

  // entity_id: si la key está fija a una entidad, se usa esa siempre (no se
  // acepta un entity_id distinto en el body — evitaría que una integración
  // externa "escape" hacia otra entidad del mismo owner). Si la key no
  // tiene entidad fija, el caller puede mandar entity_id explícito.
  const entityId = auth.entityId ?? (typeof body.entity_id === "string" ? body.entity_id : null);

  const admin = createAdminClient();

  if (entityId) {
    const { data: entidad } = await admin
      .from("business_entities")
      .select("id")
      .eq("id", entityId)
      .eq("owner_id", auth.ownerId)
      .maybeSingle();
    if (!entidad) {
      return NextResponse.json({ error: "entity_id no pertenece a esta cuenta." }, { status: 400 });
    }
  }

  const { data: cliente, error } = await admin
    .from("clients")
    .insert({
      owner_id: auth.ownerId,
      entity_id: entityId,
      name: nombre,
      email: typeof body.email === "string" ? body.email : null,
      telefono: typeof body.telefono === "string" ? body.telefono : null,
      tax_id: typeof body.tax_id === "string" ? body.tax_id : null,
      address: typeof body.direccion === "string" ? body.direccion : null,
      es_negocio: esNegocio,
      retention_pct: retencionPct,
    })
    .select("id, name, email, telefono, tax_id, address, es_negocio, retention_pct, active, created_at")
    .maybeSingle();

  if (error || !cliente) {
    return NextResponse.json({ error: error?.message ?? "No se pudo crear el cliente." }, { status: 500 });
  }

  return NextResponse.json(
    {
      data: {
        id: cliente.id,
        nombre: cliente.name,
        email: cliente.email,
        telefono: cliente.telefono,
        tax_id: cliente.tax_id,
        direccion: cliente.address,
        es_negocio: cliente.es_negocio,
        retencion_pct: cliente.retention_pct,
        activo: cliente.active,
        creado: cliente.created_at,
      },
    },
    { status: 201 }
  );
}
