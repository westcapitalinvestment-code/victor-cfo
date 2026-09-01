import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Metas de negocio — mismo componente visual que Metas personal
// (app/dashboard/metas/page.tsx), pero filtrado por la entidad activa en
// vez de entity_id null. Comparten la misma pantalla de editar (con
// ?volver= para regresar aquí en vez de a Metas personal).
export default async function MetasNegocioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entidades } = await supabase
    .from("business_entities")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!entidades || entidades.length === 0) {
    return (
      <div className="vc-shell">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de crear metas de negocio.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  const { entidadId, vistaGlobal } = resolverEntidadActiva(entidades, leerEntidadActivaCookie());

  if (vistaGlobal || !entidadId) {
    return (
      <div className="vc-shell">
        <div className="vc-card text-center">
          <p className="text-sm text-muted">Elige una entidad específica en el selector de arriba para ver sus metas.</p>
        </div>
      </div>
    );
  }

  const entidadActiva = entidades.find((e) => e.id === entidadId);

  const { data: goals, error } = await supabase
    .from("goals")
    .select("id, name, target_amount, current_amount, status")
    .eq("owner_id", user.id)
    .eq("entity_id", entidadId)
    .order("created_at", { ascending: false });

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Metas</h1>
          <p className="text-xs text-muted">{entidadActiva?.name}</p>
        </div>
        <Link href="/dashboard/negocio/metas/nueva" className="text-xs font-medium text-teal hover:opacity-80">
          + Nueva
        </Link>
      </div>

      <div className="vc-card">
        {error && <p className="text-xs text-amb">No se pudo leer goals ({error.message}).</p>}

        {!error && (!goals || goals.length === 0) && (
          <p className="py-4 text-center text-sm text-muted">Sin metas de negocio todavía.</p>
        )}

        {goals && goals.length > 0 && (
          <div className="flex flex-col gap-4">
            {goals.map((g) => {
              const pct = g.target_amount > 0 ? Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100)) : 0;
              return (
                <div key={g.id} className="vc-goal">
                  <div className="vc-goal-row">
                    <span>{g.name}</span>
                    <span className="text-muted">
                      <Sensitive>
                        {formatMoney(Number(g.current_amount), 0)} / {formatMoney(Number(g.target_amount), 0)}
                      </Sensitive>{" "}
                      · {pct}%
                    </span>
                  </div>
                  <div className="vc-bar">
                    <div className="vc-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-end">
                    <Link
                      href={`/dashboard/metas/${g.id}/editar?volver=/dashboard/negocio/metas`}
                      className="text-xs font-medium text-muted hover:text-teal"
                    >
                      Editar / eliminar
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
