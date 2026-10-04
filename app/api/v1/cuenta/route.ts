import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autenticarApiKey } from "@/lib/api-auth";

// API pública v1 — Cuenta. Ver API.md en la raíz del proyecto.
//
// Añadido el 5 oct 2026 por un rechazo de Zapier a la integración
// (victor-cfo-zapier): su test de autenticación pegaba a /api/v1/clientes,
// que no trae ningún dato identificable de LA CUENTA (solo clientes DEL
// usuario) — así que el connectionLabel de Zapier era un string fijo
// ("Cuenta VICTOR CFO"), y Zapier exige que sea dinámico para poder
// distinguir varias cuentas conectadas. Este endpoint sí expone algo
// identificable (el email del dueño y, si la key está fija a una entidad,
// el nombre de esa entidad) para que connectionLabel lo use.
//
// A propósito NO requiere ningún scope particular (clientes:leer,
// facturas:leer, etc.) — cualquier API key válida y no revocada puede
// pegarle, porque el propósito es solo "¿esta key sigue siendo válida y
// quién es?", igual que haría un endpoint /me en cualquier otra API.
export async function GET(request: Request) {
  const auth = await autenticarApiKey(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();

  const { data: owner } = await admin.from("users").select("email, full_name").eq("id", auth.ownerId).maybeSingle();

  let entidad: { id: string; name: string } | null = null;
  if (auth.entityId) {
    const { data } = await admin.from("business_entities").select("id, name").eq("id", auth.entityId).maybeSingle();
    entidad = data ?? null;
  }

  return NextResponse.json({
    data: {
      email: owner?.email ?? null,
      nombre: owner?.full_name ?? null,
      entidad: entidad ? { id: entidad.id, nombre: entidad.name } : null,
    },
  });
}
