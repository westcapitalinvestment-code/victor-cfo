import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

// Lista de clientes — Feature 1 del WCV Technical Brief V6 ("Retención B2B
// 10%/6% con Toggle y Pote Visual", Prioridad ALTA). Cada cliente trae
// es_negocio + retention_pct, que es lo que después alimenta el desglose
// automático al facturar (subtotal / retención / total).
export default async function ClientesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, name, email, es_negocio, retention_pct, entity_id")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="vc-shell">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-sm text-muted hover:opacity-80">
            ← VICTOR
          </Link>
        </div>
      </div>

      <div className="vc-card">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted">Clientes</p>
          <Link href="/dashboard/clientes/nuevo" className="text-xs font-medium text-teal hover:opacity-80">
            + Nuevo cliente
          </Link>
        </div>

        {error && (
          <p className="text-xs text-amb">
            No se pudo leer clients todavía ({error.message}). Si acabas de correr la migración
            0006, dale refresh — puede tardar unos segundos en propagarse.
          </p>
        )}

        {!error && (!clients || clients.length === 0) && (
          <p className="text-xs text-muted">
            Todavía no tienes clientes. Dale a "+ Nuevo cliente" arriba para crear el primero.
          </p>
        )}

        {clients && clients.length > 0 && (
          <ul className="flex flex-col gap-2">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                <div>
                  <p>{c.name}</p>
                  {c.email && <p className="text-xs text-muted">{c.email}</p>}
                </div>
                {c.es_negocio ? (
                  <span className="rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal">
                    Retención {Number(c.retention_pct)}%
                  </span>
                ) : (
                  <span className="text-xs text-muted">Individual</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
