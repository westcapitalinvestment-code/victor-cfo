import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { Sensitive } from "@/lib/privacy";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

function esPasivo(type: string | null): boolean {
  return type === "credit" || type === "loan";
}

// Cuentas de negocio (1 sept 2026) — ya no es cascarón: lee las cuentas de
// Plaid que el usuario asignó a esta entidad desde /dashboard/cuentas
// ("Pertenece a"). No conecta un banco nuevo aquí — una cuenta bancaria de
// PR normalmente ya trae mezcladas cuentas personales y de negocio bajo un
// mismo login (caso real de Joel con BPPR), así que asignar entidad pasa
// por Personal → Cuentas, no por un botón "Conectar" aparte dentro de
// Negocio (evita conectar el mismo banco dos veces).
export default async function CuentasNegocioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entidades } = await supabase.from("business_entities").select("id, name").eq("owner_id", user.id).eq("active", true);
  const { entidadId, vistaGlobal } = resolverEntidadActiva(entidades ?? [], leerEntidadActivaCookie());
  const entidadActiva = entidades?.find((e) => e.id === entidadId);

  if (vistaGlobal || !entidadId) {
    return (
      <div className="vc-shell">
        <div className="mb-4">
          <h1 className="text-lg font-medium">Cuentas</h1>
        </div>
        <div className="vc-card text-center">
          <p className="text-sm text-muted">Elige una entidad específica en el selector de arriba para ver sus cuentas.</p>
        </div>
      </div>
    );
  }

  const { data: cuentas } = await supabase
    .from("plaid_accounts")
    .select("id, plaid_account_id, name, nickname, mask, type, subtype, current_balance")
    .eq("owner_id", user.id)
    .eq("entity_id", entidadId)
    .order("name", { ascending: true });

  const todasLasCuentas = cuentas ?? [];
  const totalBalance = todasLasCuentas
    .filter((c) => c.type === "depository")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  return (
    <div className="vc-shell">
      <div className="mb-4">
        <h1 className="text-lg font-medium">Cuentas</h1>
        <p className="text-xs text-muted">{entidadActiva?.name} · Negocio</p>
      </div>

      {todasLasCuentas.length === 0 ? (
        <div className="vc-card text-center">
          <p className="mb-3 text-sm text-muted">
            Todavía no tienes ninguna cuenta bancaria asignada a {entidadActiva?.name ?? "esta entidad"}.
          </p>
          <Link href="/dashboard/cuentas" className="vc-btn-primary inline-block !w-auto px-4">
            Ir a Cuentas (Personal) →
          </Link>
          <p className="mt-2 text-[11px] text-muted">
            Ahí, junto a cada cuenta, elige &quot;Pertenece a&quot; y selecciona {entidadActiva?.name ?? "esta entidad"}.
          </p>
        </div>
      ) : (
        <>
          <div className="vc-bal mb-3">
            <p className="vc-bal-lbl">Balance total</p>
            <p className="vc-bal-amt">
              <Sensitive>{formatMoney(totalBalance)}</Sensitive>
            </p>
          </div>

          <div className="vc-card mb-3 !p-0">
            {todasLasCuentas.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
                <div>
                  <p className="text-sm text-text">{c.nickname || c.name}</p>
                  <p className="text-xs capitalize text-muted">
                    {c.subtype} {c.mask && `••${c.mask}`}
                  </p>
                </div>
                <p className={`text-sm font-medium ${esPasivo(c.type) ? "!text-red" : ""}`}>
                  <Sensitive>
                    {esPasivo(c.type) ? "-" : ""}
                    {formatMoney(Number(c.current_balance || 0))}
                  </Sensitive>
                </p>
              </div>
            ))}
          </div>

          <Link href="/dashboard/cuentas" className="text-xs font-medium text-teal hover:opacity-80">
            Administrar cuentas / asignaciones →
          </Link>
        </>
      )}
    </div>
  );
}
