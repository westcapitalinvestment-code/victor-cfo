import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";

export default async function MetasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: goals, error } = await supabase
    .from("goals")
    .select("id, name, target_amount, current_amount, status")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .order("created_at", { ascending: false });

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Metas</h1>
        <Link href="/dashboard/metas/nueva" className="text-xs font-medium text-teal hover:opacity-80">
          + Nueva
        </Link>
      </div>

      <div className="vc-card">
        {error && <p className="text-xs text-amb">No se pudo leer goals ({error.message}).</p>}

        {!error && (!goals || goals.length === 0) && (
          <p className="py-4 text-center text-sm text-muted">Sin metas todavía.</p>
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
                      href={`/dashboard/metas/${g.id}/editar`}
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
