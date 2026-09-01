import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

// Lista de Citas — vive fuera del bottom nav (mismo patrón que
// /dashboard/clientes), se llega desde la tarjeta "Próxima cita" del Inicio
// o desde el link dentro de Bóveda. A diferencia de documentos/page.tsx no
// hay archivos adjuntos ni tipo de renovación — solo fecha, hora y costo
// estimado. Las citas ya marcadas "hecha" se muestran al final, tachadas,
// en vez de desaparecer — conservan el historial (ej. cuánto costó al
// final vs. lo estimado).
export default async function CitasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: citas, error } = await supabase
    .from("citas")
    .select("id, titulo, fecha, hora, costo_estimado, hecha")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .order("hecha", { ascending: true })
    .order("fecha", { ascending: true });

  const fmtDinero = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="vc-shell">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-medium">Citas</h1>
        <Link href="/dashboard/citas/nueva" className="text-xs font-medium text-teal hover:opacity-80">
          + Nueva
        </Link>
      </div>

      {/* Mismo par de tabs que en Bóveda, con Citas activo aquí. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard/documentos"
          className="rounded-pill border px-3 py-1.5 text-xs font-medium text-muted hover:opacity-80"
          style={{ borderColor: "var(--border)" }}
        >
          ← Documentos
        </Link>
        <span className="rounded-pill border border-teal px-3 py-1.5 text-xs font-medium text-teal">
          Citas
        </span>
      </div>

      <div className="vc-card">
        {error && <p className="text-xs text-amb">No se pudo leer citas ({error.message}).</p>}

        {!error && (!citas || citas.length === 0) && (
          <p className="py-4 text-center text-sm text-muted">Sin citas todavía.</p>
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
                <Link href={`/dashboard/citas/${c.id}/editar`} className="text-xs font-medium text-teal hover:opacity-80">
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
