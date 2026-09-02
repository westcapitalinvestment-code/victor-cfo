import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";
import AdminNav from "@/app/admin/admin-nav";

// Bóveda de negocio — exclusivo del nivel Administrador. Alcance v1: lista +
// subir, sin editar/borrar (la pantalla de editar compartida asume dueño —
// ver la misma nota en metas/page.tsx).
export default async function AdminBovedaPage({ params }: { params: { entityId: string } }) {
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

  const [{ data: documentos, error }, { data: archivos }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, nombre, tipo, fecha_vencimiento, estado")
      .eq("owner_id", ownerId)
      .eq("entity_id", entityId)
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
    supabase.from("document_files").select("document_id").eq("owner_id", ownerId),
  ]);

  const conteoPorDocumento = new Map<string, number>();
  for (const a of archivos ?? []) {
    conteoPorDocumento.set(a.document_id, (conteoPorDocumento.get(a.document_id) ?? 0) + 1);
  }

  return (
    <>
      <AdminNav entityId={entityId} activo="boveda" />
      <div className="vc-shell">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-medium">Bóveda</h1>
          <Link href={`/admin/${entityId}/boveda/nuevo`} className="text-xs font-medium text-teal hover:opacity-80">
            + Nuevo
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
                    <span className="text-xs text-muted">{d.fecha_vencimiento ? `Vence ${d.fecha_vencimiento}` : "Sin vencimiento"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
