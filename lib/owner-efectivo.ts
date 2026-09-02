import { SupabaseClient } from "@supabase/supabase-js";

// Resolver de "owner efectivo" (2 sept 2026) — pieza central del Portal real
// de Admin/Secretaria. Hasta ahora, TODAS las páginas de Facturación asumían
// que quien está logueado (user.id) ES el dueño del negocio: filtraban
// `.eq("owner_id", user.id)` y escribían `owner_id: user.id` en cada
// insert. Eso funciona para el dueño, pero un admin/secretaria invitado
// tiene su PROPIO user.id (su propia cuenta de Supabase Auth) — nunca es
// igual al owner_id del doctor que lo invitó. Sin este resolver, un
// admin logueado vería una lista vacía (0 clientes, 0 facturas) o, peor,
// crearía facturas "fantasma" colgando de su propio user.id.
//
// La seguridad de verdad sigue viviendo en RLS (migración 0054): las
// políticas *_owner_admin_write ya verifican
// `EXISTS (account_members WHERE owner_id = <fila> AND member_email =
// auth.email() AND role = 'admin' AND active)`. Este resolver NO otorga
// acceso — solo le dice a la app A QUIÉN pedirle los datos. Si alguien
// intenta pedir datos de un owner_id al que no tiene acceso legítimo, Postgres
// simplemente no devuelve filas (o rechaza el insert/update).
//
// Diseño: un admin/secretaria SIEMPRE está atado a UNA sola entidad
// (admin_invitations.entity_id / account_members.entity_id son NOT NULL) —
// a diferencia del CPA, que puede ver "todas las entidades" de un dueño.
export type AdminTier = "secretaria" | "administrador";

export type OwnerEfectivo = {
  ownerId: string;
  esAdmin: boolean;
  entityIdForzado: string | null; // null = dueño (usa el selector normal de entidad)
  permisos: Record<string, boolean>;
  // Nivel de acceso (migración 0056, 2 sept 2026): 'secretaria' = alcance
  // original (Facturas/Clientes + los 5 toggles); 'administrador' = además
  // Pagos, Metas, Bóveda y Cuentas (solo lectura) — ver 0056 para el detalle
  // de qué políticas RLS dependen de este valor.
  adminTier: AdminTier;
};

// Devuelve null si el usuario NO es admin/secretaria de nadie — en ese
// caso, quien llama debe asumir que es el dueño y usar user.id normal.
// Si el mismo correo llegara a ser admin de VARIOS dueños (raro, pero la
// tabla lo permite), se usa la membresía más reciente — un admin/secretaria
// entra a un solo negocio a la vez, igual que el CPA entra a "todas sus
// entidades" pero nunca mezcla dos dueños distintos en una sola pantalla.
export async function resolverOwnerEfectivo(
  supabase: SupabaseClient,
  userEmail: string
): Promise<OwnerEfectivo | null> {
  const { data: membresia } = await supabase
    .from("account_members")
    .select("owner_id, entity_id, permissions, admin_tier")
    .eq("member_email", userEmail)
    .eq("role", "admin")
    .eq("active", true)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!membresia) return null;

  return {
    ownerId: membresia.owner_id,
    esAdmin: true,
    entityIdForzado: membresia.entity_id,
    permisos: (membresia.permissions as Record<string, boolean>) ?? {},
    adminTier: (membresia.admin_tier as AdminTier) ?? "secretaria",
  };
}
