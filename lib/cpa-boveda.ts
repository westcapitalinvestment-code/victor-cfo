import { createAdminClient } from "@/lib/supabase/admin";

// Permiso del contable sobre Documentos de un cliente (15 oct 2026).
//
// - Personal (entityId = null): requiere una fila account_members activa
//   role='cpa' con share_personal = true.
// - Negocio (entityId = id): requiere una fila activa role='cpa' del dueño con
//   entity_id NULL (todas las entidades) o igual a esa entidad.
//
// Se evalúa con el service role porque la ESCRITURA del contable no pasa por
// RLS (un contable no tiene permiso de escribir en documents/document_files).
export async function contablePuedeUsarBoveda(params: {
  email: string | null | undefined;
  ownerId: string;
  entityId: string | null;
}): Promise<boolean> {
  const { email, ownerId, entityId } = params;
  if (!email) return false;
  const admin = createAdminClient();

  const { data: filas } = await admin
    .from("account_members")
    .select("entity_id, share_personal")
    .eq("owner_id", ownerId)
    .ilike("member_email", email)
    .eq("role", "cpa")
    .eq("active", true);

  if (!filas || filas.length === 0) return false;
  if (entityId === null) return filas.some((f) => f.share_personal === true);
  return filas.some((f) => f.entity_id === null || f.entity_id === entityId);
}

// Confirma que la entidad pertenezca al dueño (evita que un contable con
// acceso a una entidad pase el id de otra de otro dueño).
export async function entidadEsDelDueno(entityId: string, ownerId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("business_entities")
    .select("id")
    .eq("id", entityId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  return !!data;
}
