import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

// "Bóveda" del mockup — lista de documentos con su fecha de vencimiento.
export default async function DocumentosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: documentos, error } = await supabase
    .from("documents")
    .select("id, nombre, tipo, fecha_vencimiento, estado, r2_key")
    .eq("owner_id", user.id)
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Bóveda</h1>
        <Link href="/dashboard/documentos/nuevo" className="text-xs font-medium text-teal hover:opacity-80">
          + Nuevo
        </Link>
      </div>

      <div className="vc-card">
        {error && <p className="text-xs text-amb">No se pudo leer documents ({error.message}).</p>}

        {!error && (!documentos || documentos.length === 0) && (
          <p className="py-4 text-center text-sm text-muted">Sin documentos todavía.</p>
        )}

        {documentos && documentos.length > 0 && (
          <ul className="flex flex-col gap-1">
            {documentos.map((d) => (
              <li key={d.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                <div>
                  <p>{d.nombre}</p>
                  <p className="text-xs text-muted">{d.tipo}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">
                    {d.fecha_vencimiento ? `Vence ${d.fecha_vencimiento}` : "Sin vencimiento"}
                  </span>
                  {d.r2_key && (
                    <a
                      href={`/api/documentos/${d.id}/ver`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-teal hover:opacity-80"
                    >
                      Ver
                    </a>
                  )}
                  <Link href={`/dashboard/documentos/${d.id}/editar`} className="text-xs font-medium text-teal hover:opacity-80">
                    Editar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
