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

const DIA_MS = 86400000;
const DIAS_PROTECCION = 60;

type Admin = ReturnType<typeof createAdminClient>;
type Ficha = Record<string, unknown> & { id: string };

// Une una ficha "huérfana" (sin portal, creada por un vendedor) con la ficha
// del contable (que sí tiene user_id) para que no queden duplicadas.
// Regla de prioridad del bono: si el vendedor de la huérfana todavía tiene su
// seguimiento vigente (60 días), él gana; si no, se queda con quien ya estaba
// en la ficha del contable (ej. el vendedor cuyo link usó). Los datos del
// vendedor (notas, descripción) se conservan; lo que el contable ya escribió
// no se pisa. La huérfana se borra al final (libera correo y teléfono únicos).
export async function fusionarFichas(admin: Admin, portal: Ficha, huerfana: Ficha) {
  if (portal.id === huerfana.id || huerfana.user_id) return portal;
  const ahora = Date.now();
  const vigente =
    !!huerfana.socio_id && !!huerfana.owner_expira_at && new Date(huerfana.owner_expira_at as string).getTime() > ahora;

  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (vigente || (!portal.socio_id && huerfana.socio_id)) {
    upd.socio_id = huerfana.socio_id;
    upd.owner_expira_at = huerfana.owner_expira_at;
  }
  if (!portal.notas_vendedor && huerfana.notas_vendedor) upd.notas_vendedor = huerfana.notas_vendedor;
  if (!portal.descripcion_vendedor && huerfana.descripcion_vendedor) upd.descripcion_vendedor = huerfana.descripcion_vendedor;
  for (const k of ["contacto_nombre", "pueblo", "web", "instagram", "facebook"] as const) {
    if (!portal[k] && huerfana[k]) upd[k] = huerfana[k];
  }
  for (const k of ["sectores", "especialidades"] as const) {
    if (!((portal[k] as string[] | undefined)?.length) && (huerfana[k] as string[] | undefined)?.length) upd[k] = huerfana[k];
  }

  // Primero se borra la huérfana (para liberar email/teléfono únicos) y luego se completa la del contable.
  const huerfanaEmail = (huerfana.email as string | null) ?? null;
  const huerfanaTel = (huerfana.telefono as string | null) ?? null;
  await admin.from("oficinas_contables").delete().eq("id", huerfana.id).is("user_id", null);
  if (!portal.telefono && huerfanaTel) upd.telefono = huerfanaTel;
  if (!portal.email && huerfanaEmail) upd.email = huerfanaEmail;

  const { data } = await admin.from("oficinas_contables").update(upd).eq("id", portal.id).select("*").maybeSingle();
  return (data as Ficha | null) ?? portal;
}

// Busca una huérfana con el mismo teléfono que el contable acaba de poner y la une.
export async function fusionarPorTelefono(admin: Admin, ficha: Ficha, telefono: string | null) {
  if (!telefono) return ficha;
  const { data: otra } = await admin
    .from("oficinas_contables")
    .select("*")
    .eq("telefono", telefono)
    .is("user_id", null)
    .neq("id", ficha.id)
    .maybeSingle();
  if (!otra) return ficha;
  return fusionarFichas(admin, ficha, otra as Ficha);
}

// El contable se registró con el link de un vendedor (/registro/cpa?v=CÓDIGO):
// la ficha queda a nombre de ese vendedor (60 días, y bono cuando traiga
// clientes) salvo que otro vendedor ya la tenga con seguimiento vigente.
export async function vincularVendedorPorCodigo(
  ctx: { admin: Admin; userId: string; email: string; nombre: string | null },
  codigo: string
): Promise<{ ok: boolean; motivo?: string }> {
  const cod = codigo.trim().toUpperCase().slice(0, 40);
  if (!cod) return { ok: false, motivo: "sin_codigo" };
  const { data: socio } = await ctx.admin
    .from("socios")
    .select("id, tipo, estado")
    .eq("codigo", cod)
    .maybeSingle();
  if (!socio || socio.tipo !== "vendedor" || socio.estado !== "aprobado") return { ok: false, motivo: "vendedor_invalido" };

  const ficha = await fichaDelContable(ctx);
  if (!ficha) return { ok: false, motivo: "sin_ficha" };

  const ahora = Date.now();
  const vigente =
    !!ficha.socio_id && !!ficha.owner_expira_at && new Date(ficha.owner_expira_at as string).getTime() > ahora;
  if (vigente && ficha.socio_id !== socio.id) return { ok: true, motivo: "ya_tiene_vendedor" };

  await ctx.admin
    .from("oficinas_contables")
    .update({
      socio_id: socio.id,
      owner_expira_at: new Date(ahora + DIAS_PROTECCION * DIA_MS).toISOString(),
      estado: "interesado",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ficha.id);
  return { ok: true };
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
