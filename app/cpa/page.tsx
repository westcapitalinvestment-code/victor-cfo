import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Portal CPA — v1 mínima (solo para cerrar el loop de "el CPA ya aceptó
// la invitación y se logueó, ¿ahora qué ve?"). Lista las entidades a las
// que tiene acceso vía account_members (role='cpa') — RLS
// (business_entities_cpa_read, migración 0003) ya filtra esto solo, así
// que esta consulta no necesita el cliente admin: un CPA autenticado con
// su sesión normal solo puede ver las entidades de los dueños que lo
// invitaron, nunca las de nadie más.
//
// Esto es un stub a propósito — el diseño completo (semáforo de cuadre
// IVU, bóveda de recibos, checklist 480, auditoría, etc., del mockup
// "VICTOR — Portal CPA.html") es el siguiente paso, todavía no construido.
export default async function CpaPortalPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: entidades, error } = await supabase
    .from("business_entities")
    .select("id, name, entity_type, ein")
    .order("name", { ascending: true });

  return (
    <div className="vc-shell">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
            V
          </div>
          <span className="text-base font-medium">VICTOR</span>
          <span className="ml-1 rounded-full border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">
            Portal CPA
          </span>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted">
          🔒 Solo lectura
        </span>
      </div>

      <div className="vc-card">
        <p className="mb-3 text-xs uppercase tracking-wide text-muted">
          Tus clientes {entidades ? `(${entidades.length})` : ""}
        </p>

        {error && <p className="text-xs text-red">No se pudieron cargar tus clientes: {error.message}</p>}

        {!error && (!entidades || entidades.length === 0) && (
          <p className="text-xs text-muted">
            Todavía no tienes clientes conectados. En cuanto un dueño te invite y aceptes, aparecerán aquí.
          </p>
        )}

        {entidades && entidades.length > 0 && (
          <div className="flex flex-col divide-y divide-border">
            {entidades.map((ent) => (
              <div key={ent.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{ent.name}</p>
                  <p className="text-xs text-muted">
                    {ent.entity_type} {ent.ein ? `· EIN ${ent.ein}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-muted/10 px-2 py-1 text-[10px] text-muted">Próximamente</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-muted">
        Este portal está en construcción — pronto vas a ver aquí el detalle de IVU, recibos, retenciones y más de
        cada cliente.
      </p>
    </div>
  );
}
