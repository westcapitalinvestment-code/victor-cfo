import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Utilidades de servidor para "Oficinas de contables" (migración 0163).

// ¿El usuario autenticado es contable? (se registró por /registro/cpa, tiene
// Firma Accountant, o fue invitado como CPA por algún cliente).
export async function contableAutenticado() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;
  const admin = createAdminClient();
  const email = user.email.toLowerCase();

  const { data: u } = await admin
    .from("users")
    .select("full_name, es_contable, es_firma_accountant")
    .eq("id", user.id)
    .maybeSingle();
  let esContable = !!(u?.es_contable || u?.es_firma_accountant);
  if (!esContable) {
    const { data: m } = await admin
      .from("account_members")
      .select("id")
      .eq("role", "cpa")
      .ilike("member_email", email)
      .limit(1)
      .maybeSingle();
    esContable = !!m;
  }
  if (!esContable) return null;
  return { admin, userId: user.id, email, nombre: (u?.full_name as string | null) || null };
}

// Devuelve (o crea) la ficha de oficina del contable.
export async function fichaDelContable(ctx: { admin: ReturnType<typeof createAdminClient>; userId: string; email: string; nombre: string | null }) {
  const { admin, userId, email, nombre } = ctx;
  await admin.rpc("sincronizar_oficinas_contables");
  const { data: existente } = await admin.from("oficinas_contables").select("*").eq("user_id", userId).maybeSingle();
  if (existente) return existente;

  const base = (nombre || email.split("@")[0]).trim().slice(0, 140);
  const nombreNorm = base.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "") || "oficina";
  const { data: nueva } = await admin
    .from("oficinas_contables")
    .insert({ nombre: base, nombre_norm: nombreNorm, email, user_id: userId, estado: "visitado", publicar: true })
    .select("*")
    .maybeSingle();
  if (nueva) return nueva;
  // Carrera / email repetido: vuelve a leer.
  const { data: otra } = await admin.from("oficinas_contables").select("*").eq("user_id", userId).maybeSingle();
  return otra;
}
