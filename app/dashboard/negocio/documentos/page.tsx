import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Bóveda de negocio — mismo componente visual que Bóveda personal
// (app/dashboard/documentos/page.tsx), filtrado por la entidad activa.
export default async function DocumentosNegocioPage() {
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
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de guardar documentos de negocio.</p>
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
          <p className="text-sm text-muted">Elige una entidad específica en el selector de arriba para ver su Bóveda.</p>
        </div>
      </div>
    );
  }

  const entidadActiva = entidades.find((e) => e.id === entidadId);

  const [{ data: documentos, error }, { data: archivos }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, nombre, tipo, fecha_vencimiento, estado")
      .eq("owner_id", user.id)
      .eq("entity_id", entidadId)
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
    supabase.from("document_files").select("document_id").eq("owner_id", user.id),
  ]);

  const conteoPorDocumento = new Map<string, number>();
  for (const a of archivos ?? []) {
    conteoPorDocumento.set(a.document_id, (conteoPorDocumento.get(a.document_id) ?? 0) + 1);
  }

  return (
    <div className="vc-shell">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Bóveda</h1>
          <p className="text-xs text-muted">{entidadActiva?.name}</p>
        </div>
        <Link href="/dashboard/negocio/documentos/nuevo" className="text-xs font-medium text-teal hover:opacity-80">
          + Nuevo
        </Link>
      </div>

      {/* Mismo par de tabs que Bóveda personal, con Documentos activo aquí. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-pill border border-teal px-3 py-1.5 text-xs font-medium text-teal">Documentos</span>
        <Link
          href="/dashboard/negocio/citas"
          className="rounded-pill border px-3 py-1.5 text-xs font-medium text-muted hover:opacity-80"
          style={{ borderColor: "var(--border)" }}
        >
          Citas →
        </Link>
      </div>

      <div className="vc-card">
        {error && <p className="text-xs text-amb">No se pudo leer documents ({error.message}).</p>}

        {!error && (!documentos || documentos.length === 0) && (
          <p className="py-4 text-center text-sm text-muted">Sin documentos de negocio todavía.</p>
        )}

        {documentos && documentos.length > 0 && (
          <ul className="flex flex-col gap-1">
            {documentos.map((d) => {
              const cantidadArchivos = conteoPorDocumento.get(d.id) ?? 0;
              return (
                <li key={d.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                  <div>
                    <p>{d.nombre}</p>
                    <p className="text-xs text-muted">
                      {d.tipo}
                      {cantidadArchivos > 0 && ` · 📎 ${cantidadArchivos}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">
                      {d.fecha_vencimiento ? `Vence ${d.fecha_vencimiento}` : "Sin vencimiento"}
                    </span>
                    <Link
                      href={`/dashboard/documentos/${d.id}/editar?volver=/dashboard/negocio/documentos`}
                      className="text-xs font-medium text-teal hover:opacity-80"
                    >
                      Editar
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
