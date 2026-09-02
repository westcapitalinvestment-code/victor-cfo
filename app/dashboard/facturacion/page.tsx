import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../pro-paywall";
import FacturacionPortal from "./facturacion-portal";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Portal único de Facturación (30-31 agosto 2026) — reemplaza el intento
// anterior de dos pantallas separadas (Facturas/Cobros) para calcar la
// organización real del mockup de Joel (VICTOR Pro — Producto Completo_
// FINAL.html): un solo portal con pestañas adentro (Facturas, Cotizaciones,
// Cobros, Clientes, Servicios, Reportes). Cotizaciones/Servicios/Reportes
// quedan como "Próximamente" — fuera del alcance v1 acordado.
export default async function FacturacionPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
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
    .select("id, name, ath_movil_business_path")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de facturar.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  // Entidad activa elegida en el selector "Negocio" del topbar (o "vista
  // global" para ver todo mezclado, como era el comportamiento antes de
  // este cambio) — cada entidad debe tener su propia facturación separada,
  // así que en vez de traer todo por owner_id nada más, se filtra también
  // por entity_id cuando hay una entidad específica activa.
  const { entidadId: entidadActivaId, vistaGlobal } = resolverEntidadActiva(entities, leerEntidadActivaCookie());

  // Sin filtro de "active" — a diferencia de antes, el tab Clientes del
  // portal ahora también trae los archivados (pedido de Joel, 1 sept 2026:
  // "no se dnd verlos"), y es ClientesTab quien decide qué mostrar según el
  // dropdown de filtro.
  let clientsQuery = supabase
    .from("clients")
    .select("id, name, email, es_negocio, retention_pct, entity_id, active")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });
  let facturasQuery = supabase
    .from("invoices")
    .select("id, numero, subtotal, retencion_pct, retencion_monto, total, estado, fecha_emision, fecha_vencimiento, fecha_pago, metodo_pago, entity_id, client_id, clients(name)")
    .eq("owner_id", user.id)
    .order("fecha_emision", { ascending: false });
  let serviciosQuery = supabase
    .from("services")
    .select("id, nombre, descripcion, tipo, precio, ivu_exento, activo, entity_id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  let cotizacionesQuery = supabase
    .from("cotizaciones")
    .select("id, numero, total, estado, fecha_emision, fecha_vencimiento, client_id, clients(name)")
    .eq("owner_id", user.id)
    .order("fecha_emision", { ascending: false });

  if (!vistaGlobal && entidadActivaId) {
    clientsQuery = clientsQuery.eq("entity_id", entidadActivaId);
    facturasQuery = facturasQuery.eq("entity_id", entidadActivaId);
    serviciosQuery = serviciosQuery.eq("entity_id", entidadActivaId);
    cotizacionesQuery = cotizacionesQuery.eq("entity_id", entidadActivaId);
  }

  const { data: clients } = await clientsQuery;
  const { data: facturas } = await facturasQuery;
  const { data: servicios } = await serviciosQuery;
  const { data: cotizaciones } = await cotizacionesQuery;

  // IDs de entidad con pATH de ATH Móvil Business configurado (2 sept
  // 2026) — el fee real de 2.25% solo aplica cuando el cliente pagó al
  // pATH de la entidad (ATH Móvil Business); un ATH Móvil personal normal
  // no cobra fees. Sin esto, "Gasto procesamiento de pagos" asumía fee
  // siempre que metodo_pago fuera "ATH Móvil", lo cual salía mal (Joel, 2
  // sept 2026: "ninguna cobro fees, no se de dnd saca esos fees").
  const entidadesConAth = (entities ?? []).filter((e) => e.ath_movil_business_path).map((e) => e.id);

  return (
    <FacturacionPortal
      clients={clients ?? []}
      facturas={(facturas ?? []) as any}
      servicios={servicios ?? []}
      cotizaciones={(cotizaciones ?? []) as any}
      entidadId={entidadActivaId ?? entities[0]?.id ?? null}
      entidadesConAth={entidadesConAth}
      tabInicial={searchParams?.tab}
    />
  );
}
