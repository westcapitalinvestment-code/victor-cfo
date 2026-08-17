import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";

// Lista de transacciones personales. Vacía hasta que Plaid esté conectado
// (Cuentas) — es honesto mostrarlo así en vez de simular datos.
export default async function GastosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: transacciones, error } = await supabase
    .from("transactions")
    .select("id, description_raw, amount, fecha, category")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .order("fecha", { ascending: false })
    .limit(50);

  return (
    <div className="vc-shell">
      <h1 className="mb-4 text-lg font-medium">Gastos</h1>

      <div className="vc-card">
        {error && <p className="text-xs text-amb">No se pudo leer transactions ({error.message}).</p>}

        {!error && (!transacciones || transacciones.length === 0) && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted">Todavía no hay transacciones.</p>
            <p className="mt-1 text-xs text-muted">
              Se llenan solas cuando conectes tu banco en la pestaña Cuentas.
            </p>
          </div>
        )}

        {transacciones && transacciones.length > 0 && (
          <ul className="flex flex-col gap-1">
            {transacciones.map((t) => (
              <li key={t.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                <div>
                  <p>{t.description_raw}</p>
                  <p className="text-xs text-muted">{t.fecha} · {t.category ?? "sin categorizar"}</p>
                </div>
                <span className={Number(t.amount) > 0 ? "text-red" : "text-grn"}>
                  <Sensitive>{formatMoney(Math.abs(Number(t.amount)))}</Sensitive>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
