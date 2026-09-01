import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_ENTIDAD_ACTIVA, VALOR_VISTA_GLOBAL } from "@/lib/entidad-activa-constantes";

// Guarda en cookie cuál entidad quedó activa en el selector "Negocio" del
// topbar (o "global" si el usuario pidió ver todas las entidades juntas).
// Las páginas de Facturación/Clientes leen esta cookie server-side para
// decidir por cuál entity_id filtrar.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const entidadId = body?.entidadId as string | undefined;
  if (!entidadId) return NextResponse.json({ error: "Falta entidadId." }, { status: 400 });

  if (entidadId !== VALOR_VISTA_GLOBAL) {
    // Nunca confiar en un id que venga del cliente sin confirmar que la
    // entidad de verdad le pertenece a este usuario.
    const { data: entidad } = await supabase
      .from("business_entities")
      .select("id")
      .eq("id", entidadId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!entidad) return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_ENTIDAD_ACTIVA, entidadId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
