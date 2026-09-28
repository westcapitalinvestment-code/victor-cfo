import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../../pro-paywall";
import CobroRapidoForm from "./cobro-rapido-form";

// Cobro Rápido (28 sept 2026, pedido de Joel: "que ningún cliente se vaya
// sin pagar porque la plataforma no soporte algo") — para cobros EN PERSONA
// sin factura formal previa: el dueño (o técnico en campo) solo necesita el
// monto, opcionalmente quién es el cliente, y salir directo al QR para que
// el cliente pague ahí mismo por tarjeta o ATH Móvil. A diferencia de Nueva
// Factura, aquí el cliente es OPCIONAL — no todo cobro de mostrador/campo
// tiene un cliente ya dado de alta (ej. alguien que paga en efectivo/tarjeta
// una sola vez), y exigir crear un cliente primero sería justo la fricción
// que este atajo busca evitar.
export default async function CobroRapidoPage() {
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
    .select("id, name, invoice_prefix, invoice_start_number")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de cobrar.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, entity_id")
    .eq("owner_id", user.id)
    .eq("active", true)
    .order("name", { ascending: true });

  const conteosPorEntidad: Record<string, number> = {};
  for (const ent of entities) {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("entity_id", ent.id);
    conteosPorEntidad[ent.id] = count ?? 0;
  }

  return (
    <CobroRapidoForm
      entities={entities}
      clients={clients ?? []}
      conteosPorEntidad={conteosPorEntidad}
    />
  );
}
