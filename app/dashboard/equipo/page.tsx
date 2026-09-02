import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../pro-paywall";
import EquipoPortal from "./equipo-portal";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Portal de Equipo v2 (2 sept 2026) — reescrito sobre el mockup real de
// Joel: el técnico crea FACTURAS de verdad (tabla invoices), no un
// registro aparte. Este archivo trae todo lo que necesita el portal:
// técnicos, la config de Equipo de la entidad (aprobación/permisos
// default), los contratistas de Pagos (para el vínculo "¿también le
// pagas?"), y las facturas con technician_id de esta entidad (para el
// Panel del día y Reportes).
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
    .select(
      "id, name, equipo_aprobacion_default, equipo_tecnico_ve_precios, equipo_tecnico_cobra_vencidas, equipo_tecnico_anade_clientes, equipo_tecnico_aplica_descuento, equipo_tecnico_descuento_max_pct"
    )
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

  // Equipo (igual que antes) no tiene vista global entre entidades — un
  // técnico y sus facturas viven en UNA entidad. Si el topbar está en
  // "Todas", se fuerza la primera.
  const entidadIdEfectiva = vistaGlobal ? entities[0].id : entidadActiva?.id ?? entities[0].id;
  const entidadEfectiva = entities.find((e) => e.id === entidadIdEfectiva) ?? entities[0];

  const [{ data: tecnicos }, { data: vendors }, { data: facturas }] = await Promise.all([
    supabase
      .from("technicians")
      .select("id, name, phone, access_token, approval_mode, max_discount_pct, active, entity_id, vendor_id")
      .eq("owner_id", user.id)
      .eq("entity_id", entidadIdEfectiva)
      .order("created_at", { ascending: false }),
    supabase
      .from("vendors")
      .select("id, name, active")
      .eq("owner_id", user.id)
      .eq("entity_id", entidadIdEfectiva)
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("invoices")
      .select(
        "id, numero, technician_id, client_id, clients(name), estado, total, pendiente_revision_tecnico, fecha_emision, fecha_pago, metodo_pago, created_at"
      )
      .eq("entity_id", entidadIdEfectiva)
      .not("technician_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  // Ítems de esas facturas (para el desglose "por servicio" en Reportes) —
  // en una segunda consulta porque depende de los ids que salieron arriba.
  const facturaIds = (facturas ?? []).map((f) => f.id);
  const { data: items } = facturaIds.length
    ? await supabase
        .from("invoice_items")
        .select("invoice_id, descripcion, cantidad, subtotal_linea, service_id, services(nombre)")
        .in("invoice_id", facturaIds)
    : { data: [] as any[] };

  return (
    <EquipoPortal
      tecnicos={tecnicos ?? []}
      vendors={vendors ?? []}
      facturas={(facturas ?? []) as any}
      items={(items ?? []) as any}
      entidad={entidadEfectiva}
      vistaGlobalActiva={vistaGlobal}
      cantidadEntidades={entities.length}
    />
  );
}
