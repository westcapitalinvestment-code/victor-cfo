import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../pro-paywall";
import EquipoPortal from "./equipo-portal";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Portal de Equipo (2 sept 2026) — reemplaza el placeholder "en
// construcción". Primera parte construida: Técnicos (el flujo "técnico
// visita cliente → cobra el servicio → queda registrado"), usando las
// tablas que ya existían desde la migración 0003 pero nunca tuvieron UI:
// technicians, technician_service_catalog, technician_visits,
// technician_visit_items. La otra mitad de Equipo (invitar miembros
// admin/secretaria vía account_members) queda para después — Joel pidió
// empezar por técnicos.
export default async function EquipoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
  if (!esPro) return <ProPaywall />;

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de gestionar tu equipo.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  const { entidadId: entidadActivaId, vistaGlobal } = resolverEntidadActiva(entities, leerEntidadActivaCookie());
  const entidadActiva = entities.find((e) => e.id === entidadActivaId) ?? entities[0];
  const entidadId = vistaGlobal ? null : entidadActiva?.id ?? entities[0].id;

  // A diferencia de Facturación/Pagos, Equipo (técnicos) NO tiene una vista
  // global útil entre entidades — un técnico y su catálogo de servicios
  // pertenecen a UNA entidad específica (así lo asume el schema:
  // technician_service_catalog.entity_id es NOT NULL). Si el selector del
  // topbar está en "Todas", forzamos la primera entidad activa en vez de
  // mostrar una pantalla vacía o mezclada.
  const entidadIdEfectiva = entidadId ?? entities[0].id;
  const entidadEfectiva = entities.find((e) => e.id === entidadIdEfectiva) ?? entities[0];

  const [{ data: tecnicos }, { data: catalogo }, { data: visitas }] = await Promise.all([
    supabase
      .from("technicians")
      .select("id, name, phone, access_token, approval_mode, max_discount_pct, active, entity_id")
      .eq("owner_id", user.id)
      .eq("entity_id", entidadIdEfectiva)
      .order("created_at", { ascending: false }),
    supabase
      .from("technician_service_catalog")
      .select("id, nombre, descripcion, precio, activo, entity_id")
      .eq("entity_id", entidadIdEfectiva)
      .order("nombre", { ascending: true }),
    supabase
      .from("technician_visits")
      .select("id, technician_id, client_name_raw, estado, total, metodo_cobro, monto_cobrado, cobrado_at, requiere_aprobacion, created_at, entity_id")
      .eq("entity_id", entidadIdEfectiva)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <EquipoPortal
      tecnicos={tecnicos ?? []}
      catalogo={catalogo ?? []}
      visitas={visitas ?? []}
      entidadId={entidadIdEfectiva}
      entidadNombre={entidadEfectiva.name}
      vistaGlobalActiva={vistaGlobal}
      cantidadEntidades={entities.length}
    />
  );
}
