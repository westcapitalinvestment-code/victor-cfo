import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Citas de negocio (1 sept 2026, migración 0041) — mismo componente visual
// que Citas personal (app/dashboard/citas/page.tsx), filtrado por la
// entidad activa en vez de entity_id null. Comparte la misma pantalla de
// editar (con ?volver= para regresar aquí en vez de a Citas personal).
export default async function CitasNegocioPage() {
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
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de crear citas de negocio.</p>
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
          <p className="text-sm text-muted">Elige una entidad específica en el selector de arriba para ver sus citas.</p>
        </div>
      </div>
    );
  }

  const entidadActiva = entidades.find((e) => e.id === entidadId);

  const { data: citas, error } = await supabase
    .from("citas")
    .select("id, titulo, fecha, hora, costo_estimado, hecha")
    .eq("owner_id", user.id)
    .eq("entity_id", entidadId)
    .order("hecha", { ascending: true })
    .order("fecha", { ascending: true });

  const fmtDinero = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="vc-shell">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Citas</h1>
          <p className="text-xs text-muted">{entidadActiva?.name}</p>
        </div>
        <Link href="/dashboard/negocio/citas/nueva" className="text-xs font-medium text-teal hover:opacity-80">
          + Nueva
        </Link>
      </div>

      {/* Mismo par de tabs que Bóveda personal, con Citas activo aquí. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard/negocio/documentos"
          className="rounded-pill border px-3 py-1.5 text-xs font-medium text-muted hover:opacity-80"
          style={{ borderColor: "var(--border)" }}
        >
          ← Documentos
        </Link>
        <span className="rounded-pill border border-teal px-3 py-1.5 text-xs font-medium text-teal">Citas</span>
      </div>

      <div className="vc-card">
        {error && <p className="text-xs text-amb">No se pudo leer citas ({error.message}).</p>}

        {!error && (!citas || citas.length === 0) && (
          <p className="py-4 text-center text-sm text-muted">Sin citas de negocio todavía.</p>
        )}

        {citas && citas.length > 0 && (
          <ul className="flex flex-col gap-1">
            {citas.map((c) => (
              <li
                key={c.id}
                className={`flex items-center justify-between border-b border-border py-2 text-sm last:border-0 ${c.hecha ? "opacity-50" : ""}`}
              >
                <div>
                  <p className={c.hecha ? "line-through" : ""}>{c.titulo}</p>
                  <p className="text-xs text-muted">
                    {c.fecha}
                    {c.hora && ` · ${c.hora}`}
                    {c.costo_estimado !== null && ` · ${fmtDinero(Number(c.costo_estimado))}`}
                  </p>
                </div>
                <Link
                  href={`/dashboard/citas/${c.id}/editar?volver=/dashboard/negocio/citas`}
                  className="text-xs font-medium text-teal hover:opacity-80"
                >
                  Editar
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
