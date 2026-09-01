import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Cascarón (1 sept 2026) — mismo motivo que negocio/gastos/page.tsx: falta
// que manual_accounts tenga entity_id y que Plaid Link acepte un entityId
// (hoy exchange-token guarda entity_id: null siempre). Queda para la
// siguiente ronda de trabajo, después de Metas/Bóveda/Inicio de negocio.
export default async function CuentasNegocioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entidades } = await supabase.from("business_entities").select("id, name").eq("owner_id", user.id).eq("active", true);
  const { entidadId, vistaGlobal } = resolverEntidadActiva(entidades ?? [], leerEntidadActivaCookie());
  const entidadActiva = entidades?.find((e) => e.id === entidadId);

  return (
    <div className="vc-shell">
      <div className="mb-4">
        <h1 className="text-lg font-medium">Cuentas</h1>
        {!vistaGlobal && entidadActiva && <p className="text-xs text-muted">{entidadActiva.name}</p>}
      </div>
      <div className="vc-card">
        <p className="text-sm text-muted">
          Conectar el banco de {entidadActiva?.name ?? "esta entidad"} todavía está en construcción — por ahora
          cada entidad no tiene su propia cuenta bancaria en VICTOR.
        </p>
        <Link href="/dashboard/negocio" className="mt-2 inline-block text-xs font-medium text-teal hover:opacity-80">
          ← Volver a Inicio de negocio
        </Link>
      </div>
    </div>
  );
}
