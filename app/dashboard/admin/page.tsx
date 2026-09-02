import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../pro-paywall";
import AdminPortal from "./admin-portal";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Módulo real de Admin/Secretaria (2 sept 2026) — el tab "Admin" del nav de
// negocio apuntaba antes al Dashboard de Operaciones del founder (se movió
// a /dashboard/cfo, ver bottom-nav.tsx). Este SÍ es lo que dice el nav:
// Joel invita a su secretaria/administrador con su propio login, viendo
// solo facturación por diseño — mockup real de Joel (2 sept 2026).
// Mismo patrón de resolución de entidad que equipo/page.tsx: Admin/Secretaria
// no tiene vista global entre entidades, vive en UNA entidad a la vez.
export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("plan, addon_admin_status, addon_admin_seats")
    .eq("id", user.id)
    .maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
  if (!esPro) return <ProPaywall />;
  const addonActivo = profile?.addon_admin_status === "activo";

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de añadir un admin/secretaria.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  const { entidadId: entidadActivaId, vistaGlobal } = resolverEntidadActiva(entities, leerEntidadActivaCookie());
  const entidadActiva = entities.find((e) => e.id === entidadActivaId) ?? entities[0];
  const entidadIdEfectiva = vistaGlobal ? entities[0].id : entidadActiva?.id ?? entities[0].id;
  const entidadEfectiva = entities.find((e) => e.id === entidadIdEfectiva) ?? entities[0];

  const [{ data: vendors }, { data: miembros }, { data: invitaciones }] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, active")
      .eq("owner_id", user.id)
      .eq("entity_id", entidadIdEfectiva)
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("account_members")
      .select("id, member_email, member_name, permissions, active, vendor_id, accepted_at, vendors(name), admin_tier")
      .eq("owner_id", user.id)
      .eq("entity_id", entidadIdEfectiva)
      .eq("role", "admin")
      .order("accepted_at", { ascending: false }),
    supabase
      .from("admin_invitations")
      .select("id, admin_name, admin_email, permissions, vendor_id, status, sent_at, invitation_token, admin_tier")
      .eq("owner_id", user.id)
      .eq("entity_id", entidadIdEfectiva)
      .eq("status", "pending")
      .order("sent_at", { ascending: false }),
  ]);

  return (
    <AdminPortal
      vendors={vendors ?? []}
      miembros={(miembros ?? []) as any}
      invitaciones={invitaciones ?? []}
      entidad={entidadEfectiva}
      vistaGlobalActiva={vistaGlobal}
      cantidadEntidades={entities.length}
      addonActivo={addonActivo}
      addonSeats={profile?.addon_admin_seats ?? 0}
    />
  );
}
