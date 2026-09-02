import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";
import AdminNav from "@/app/admin/admin-nav";

// Metas de negocio — exclusivo del nivel Administrador. Alcance v1
// deliberadamente angosto (igual que se hizo con Facturación en modoAdmin):
// lista + crear, SIN editar/eliminar — la pantalla de editar compartida
// (/dashboard/metas/[id]/editar) asume que quien entra es el dueño
// (user.id = owner_id), y un admin nunca lo es. Editar/eliminar para
// Administrador queda para una próxima ronda si Joel lo pide.
export default async function AdminMetasPage({ params }: { params: { entityId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const efectivo = await resolverOwnerEfectivo(supabase, user.email);
  if (!efectivo || !efectivo.entityIdForzado) redirect("/dashboard");
  if (params.entityId !== efectivo.entityIdForzado) redirect(`/admin/${efectivo.entityIdForzado}`);
  if (efectivo.adminTier !== "administrador") redirect(`/admin/${efectivo.entityIdForzado}`);

  const ownerId = efectivo.ownerId;
  const entityId = efectivo.entityIdForzado;

  const { data: goals, error } = await supabase
    .from("goals")
    .select("id, name, target_amount, current_amount, status")
    .eq("owner_id", ownerId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  return (
    <>
      <AdminNav entityId={entityId} activo="metas" />
      <div className="vc-shell">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-medium">Metas</h1>
          <Link href={`/admin/${entityId}/metas/nueva`} className="text-xs font-medium text-teal hover:opacity-80">
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
                        {formatMoney(Number(g.current_amount), 0)} / {formatMoney(Number(g.target_amount), 0)} · {pct}%
                      </span>
                    </div>
                    <div className="vc-bar">
                      <div className="vc-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
