import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Lista, para la firma logueada, de los clientes que tiene bajo su plan
// wholesale (aceptados) y de sus invitaciones pendientes — para poder
// liberar/cancelar uno por uno desde el Portal CPA. Se lee con el cliente
// admin porque un contador no puede leer filas de `users` ajenas por RLS
// (solo nombre/email/fecha, nada financiero), y se filtra SIEMPRE por la
// firma autenticada.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createAdminClient();

  const { data: yo } = await admin.from("users").select("es_firma_accountant").eq("id", user.id).maybeSingle();
  if (!yo?.es_firma_accountant) return NextResponse.json({ clientes: [], pendientes: [] });

  const [{ data: aceptados }, { data: pendientes }] = await Promise.all([
    admin
      .from("users")
      .select("id, email, full_name, created_at")
      .eq("billed_by_firma_id", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("firma_invitaciones")
      .select("id, email, nombre_negocio, created_at")
      .eq("firma_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    clientes: (aceptados ?? []).map((c) => ({
      id: c.id,
      email: c.email,
      nombre: c.full_name,
      desde: c.created_at,
    })),
    pendientes: (pendientes ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      nombreNegocio: p.nombre_negocio,
      enviada: p.created_at,
    })),
  });
}
