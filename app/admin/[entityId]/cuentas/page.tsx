import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";
import AdminNav from "@/app/admin/admin-nav";

function esPasivo(type: string | null): boolean {
  return type === "credit" || type === "loan";
}

// Cuentas de negocio — exclusivo del nivel Administrador, SOLO LECTURA
// (ver balances, nunca conectar/editar/borrar un banco — migración 0056
// solo otorga SELECT en plaid_accounts a este nivel, a propósito).
export default async function AdminCuentasPage({ params }: { params: { entityId: string } }) {
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

  const { data: cuentas } = await supabase
    .from("plaid_accounts")
    .select("id, name, nickname, mask, type, subtype, current_balance")
    .eq("owner_id", ownerId)
    .eq("entity_id", entityId)
    .order("name", { ascending: true });

  const todasLasCuentas = cuentas ?? [];
  const totalBalance = todasLasCuentas.filter((c) => c.type === "depository").reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  return (
    <>
      <AdminNav entityId={entityId} activo="cuentas" />
      <div className="vc-shell">
        <div className="mb-4">
          <h1 className="text-lg font-medium">Cuentas</h1>
          <p className="text-xs text-muted">Solo lectura — ver balances</p>
        </div>

        {todasLasCuentas.length === 0 ? (
          <div className="vc-card text-center">
            <p className="text-sm text-muted">Todavía no hay ninguna cuenta bancaria asignada a este negocio.</p>
          </div>
        ) : (
          <>
            <div className="vc-bal mb-3">
              <p className="vc-bal-lbl">Balance total</p>
              <p className="vc-bal-amt">{formatMoney(totalBalance)}</p>
            </div>

            <div className="vc-card !p-0">
              {todasLasCuentas.map((c) => (
                <div key={c.id} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
                  <div>
                    <p className="text-sm text-text">{c.nickname || c.name}</p>
                    <p className="text-xs capitalize text-muted">
                      {c.subtype} {c.mask && `••${c.mask}`}
                    </p>
                  </div>
                  <p className={`text-sm font-medium ${esPasivo(c.type) ? "!text-red" : ""}`}>
                    {esPasivo(c.type) ? "-" : ""}
                    {formatMoney(Number(c.current_balance || 0))}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
