import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Directorio de contables para clientes de VICTOR (migración 0163). Solo sale
// información pública del perfil: nombre, pueblo, sectores, especialidades,
// descripción, web/IG/FB. El teléfono y el correo NO se exponen: el contacto
// pasa por /api/contables/solicitar con autorización del cliente.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const admin = createAdminClient();
  await admin.rpc("sincronizar_oficinas_contables");

  const { data, error } = await admin
    .from("oficinas_contables")
    .select("id, nombre, pueblo, sectores, especialidades, remoto, descripcion, web, instagram, facebook")
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

  // Con quién ya habló este cliente en los últimos 30 días.
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: previas } = await admin
    .from("contable_solicitudes")
    .select("oficina_id")
    .eq("cliente_id", user.id)
    .gte("created_at", desde);
  const contactados = Array.from(new Set((previas ?? []).map((p) => p.oficina_id as string)));

  return NextResponse.json({ ok: true, oficinas: completos, contactados });
}
