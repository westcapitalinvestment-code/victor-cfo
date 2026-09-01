import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Cascarón (1 sept 2026) — Gastos de negocio necesita que la entidad tenga
// al menos una cuenta (Plaid o manual) conectada a su propio entity_id, y
// hoy ni manual_accounts ni el flujo de Plaid soportan eso todavía (ver
// investigación de esa fecha). En vez de mostrar una pantalla de Gastos
// vacía y confusa, se deja este mensaje honesto hasta que Cuentas de
// negocio exista.
export default async function GastosNegocioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entidades } = await supabase.from("business_entities").select("id, name").eq("owner_id", user.id).eq("active", true);
  const { entidadId, vistaGlobal } = resolverEntidadActiva(entidades ?? [], leerEntidadActivaCookie());
  const entidadActiva = entidades?.find((e) => e.id === entidadId);

  return (
    <div className="vc-shell">
      <div className="mb-4">
        <h1 className="text-lg font-medium">Gastos</h1>
        {!vistaGlobal && entidadActiva && <p className="text-xs text-muted">{entidadActiva.name}</p>}
      </div>
      <div className="vc-card">
        <p className="text-sm text-muted">
          Todavía no puedes conectar un banco a esta entidad — en cuanto Cuentas de negocio esté lista, los gastos
          de {entidadActiva?.name ?? "tu negocio"} van a aparecer aquí automático, igual que en Personal.
        </p>
        <Link href="/dashboard/negocio" className="mt-2 inline-block text-xs font-medium text-teal hover:opacity-80">
          ← Volver a Inicio de negocio
        </Link>
      </div>
    </div>
  );
}
