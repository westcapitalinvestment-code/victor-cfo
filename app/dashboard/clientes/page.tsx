import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";
import ArchivarBoton from "./archivar-boton";

// Lista de clientes — Feature 1 del WCV Technical Brief V6 ("Retención B2B
// 10%/6% con Toggle y Pote Visual", Prioridad ALTA). Cada cliente trae
// es_negocio + retention_pct, que es lo que después alimenta el desglose
// automático al facturar (subtotal / retención / total).
//
// ?archivados=1 (1 sept 2026, pedido por Joel: "tengo unos que ya no son
// clientes") — por defecto solo se ven los activos; los archivados quedan
// a un click mediante el toggle de arriba, sin perderse ni mezclarse con
// la lista del día a día. Ver migración 0043 para por qué esto es
// "archivar" y no un DELETE de verdad.
export default async function ClientesPage({ searchParams }: { searchParams: { archivados?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const verArchivados = searchParams?.archivados === "1";

  // Misma entidad activa que usa el portal de Facturación (topbar → cookie)
  // — cada entidad ve solo sus propios clientes, salvo en "vista global".
  const { data: entidades } = await supabase.from("business_entities").select("id").eq("owner_id", user.id).eq("active", true);
  const { entidadId: entidadActivaId, vistaGlobal } = resolverEntidadActiva(entidades ?? [], leerEntidadActivaCookie());

  let clientsQuery = supabase
    .from("clients")
    .select("id, name, email, es_negocio, retention_pct, entity_id, active")
    .eq("owner_id", user.id)
    .eq("active", !verArchivados)
    .order("created_at", { ascending: false });
  if (!vistaGlobal && entidadActivaId) {
    clientsQuery = clientsQuery.eq("entity_id", entidadActivaId);
  }
  const { data: clients, error } = await clientsQuery;

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
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted">Clientes{verArchivados ? " archivados" : ""}</p>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/clientes/importar" className="text-xs font-medium text-muted hover:text-teal">
              Importar CSV
            </Link>
            <Link href="/dashboard/clientes/nuevo" className="text-xs font-medium text-teal hover:opacity-80">
              + Nuevo cliente
            </Link>
          </div>
        </div>

        <div className="mb-3">
          <Link
            href={verArchivados ? "/dashboard/clientes" : "/dashboard/clientes?archivados=1"}
            className="text-[11px] text-muted underline hover:text-teal"
          >
            {verArchivados ? "← Ver clientes activos" : "Ver archivados"}
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
            {verArchivados
              ? "No tienes ningún cliente archivado."
              : 'Todavía no tienes clientes. Dale a "+ Nuevo cliente" arriba para crear el primero.'}
          </p>
        )}

        {clients && clients.length > 0 && (
          <ul className="flex flex-col gap-2">
            {clients.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{c.name}</p>
                  {c.email && <p className="truncate text-xs text-muted">{c.email}</p>}
                </div>
                {c.es_negocio ? (
                  <span className="flex-shrink-0 rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal">
                    Retención {Number(c.retention_pct)}%
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-xs text-muted">Individual</span>
                )}
                <ArchivarBoton clienteId={c.id} activo={c.active} />
                <Link href={`/dashboard/clientes/${c.id}/editar`} className="flex-shrink-0 text-muted hover:text-teal" title="Editar cliente">
                  <i className="ti ti-edit" style={{ fontSize: 15 }} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
