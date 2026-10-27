import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OFICINAS_DEMO } from "@/lib/demo-oficinas";

// Directorio de contables para clientes de VICTOR (migración 0163). Muestra el
// perfil público completo, incluido el contacto (teléfono, correo, web, IG,
// FB): el contable lo escribe a propósito en "Mi oficina" y puede ocultarse del
// directorio cuando quiera. VICTOR no manda datos del cliente a nadie: el
// cliente contacta por su cuenta y decide cuándo compartir su información
// (invitando al contable desde "Invita a tu contable").
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  // Cuenta demo: directorio de ejemplo (12 oficinas ficticias, no se guardan).
  const { data: perfil } = await supabase.from("users").select("is_demo").eq("id", user.id).maybeSingle();
  if (perfil?.is_demo) return NextResponse.json({ ok: true, oficinas: OFICINAS_DEMO });

  const admin = createAdminClient();
  await admin.rpc("sincronizar_oficinas_contables");

  const { data, error } = await admin
    .from("oficinas_contables")
    .select("id, nombre, contacto_nombre, email, telefono, pueblo, sectores, especialidades, remoto, descripcion, web, instagram, facebook")
    .not("user_id", "is", null)
    .eq("publicar", true)
    .not("pueblo", "is", null)
    .not("descripcion", "is", null)
    .order("nombre", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: "No se pudo cargar el directorio." }, { status: 500 });

  const completos = (data ?? []).filter(
    (o) => (o.especialidades?.length ?? 0) > 0 && (o.descripcion?.trim().length ?? 0) >= 20
  );
  return NextResponse.json({ ok: true, oficinas: completos });
}
