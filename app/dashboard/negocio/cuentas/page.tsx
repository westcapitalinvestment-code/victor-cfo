import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";
import CuentasEntidadClient from "./cuentas-entidad-client";

// Cuentas de negocio (1 sept 2026, ampliado 8 sept 2026) — ya no es solo
// lectura. Antes solo mostraba las cuentas de Plaid que el usuario había
// asignado a mano a esta entidad desde /dashboard/cuentas ("Pertenece a"),
// y para conectar un banco nuevo o crear una cuenta manual mandaba a
// Personal → Cuentas. Joel pidió que cada entidad tenga su propio botón de
// conectar/añadir para que todo quede separado en su tab de una — ver
// cuentas-entidad-client.tsx (Plaid Link con entityId + cuentas manuales
// con entityId, ambos ya soportados en las rutas correspondientes). Si un
// banco conectado desde aquí trae cuentas personales mezcladas, se siguen
// pudiendo reasignar con el mismo dropdown de siempre en Cuentas (Personal).
export default async function CuentasNegocioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entidades } = await supabase.from("business_entities").select("id, name").eq("owner_id", user.id).eq("active", true);
  const { entidadId, vistaGlobal } = resolverEntidadActiva(entidades ?? [], leerEntidadActivaCookie());
  const entidadActiva = entidades?.find((e) => e.id === entidadId);

  if (vistaGlobal || !entidadId) {
    return (
      <div className="vc-shell">
        <div className="mb-4">
          <h1 className="text-lg font-medium">Cuentas</h1>
        </div>
        <div className="vc-card text-center">
          <p className="text-sm text-muted">Elige una entidad específica en el selector de arriba para ver sus cuentas.</p>
        </div>
      </div>
    );
  }

  const { data: cuentas } = await supabase
    .from("plaid_accounts")
    .select("id, plaid_account_id, name, nickname, mask, type, subtype, current_balance")
    .eq("owner_id", user.id)
    .eq("entity_id", entidadId)
    .order("name", { ascending: true });

  return (
    <div className="vc-shell">
      <div className="mb-4">
        <h1 className="text-lg font-medium">Cuentas</h1>
        <p className="text-xs text-muted">{entidadActiva?.name} · Negocio</p>
      </div>

      <CuentasEntidadClient entidadId={entidadId} cuentasIniciales={cuentas ?? []} />
    </div>
  );
}
