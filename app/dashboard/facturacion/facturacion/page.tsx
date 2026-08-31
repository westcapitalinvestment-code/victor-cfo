import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../pro-paywall";
import FacturacionPortal from "./facturacion-portal";

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
    .select("id, name")
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

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, email, es_negocio, retention_pct, entity_id")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });

  const { data: facturas } = await supabase
    .from("invoices")
    .select("id, numero, subtotal, retencion_monto, total, estado, fecha_emision, fecha_vencimiento, client_id, clients(name)")
    .eq("owner_id", user.id)
    .order("fecha_emision", { ascending: false });

  return (
    <FacturacionPortal
      clients={clients ?? []}
      facturas={(facturas ?? []) as any}
      tabInicial={searchParams?.tab}
    />
  );
}
