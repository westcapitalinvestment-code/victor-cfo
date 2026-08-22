import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/format";

// Portal CPA — lista de clientes (pantalla "Clientes" del mockup
// "VICTOR — Portal CPA.html"). RLS (business_entities_cpa_read,
// ivu_tracker_cpa_read, estimated_tax_payments_cpa_read — migración 0003)
// filtra todo esto solo: un CPA autenticado con su sesión normal solo ve
// las entidades de los dueños que lo invitaron, nunca las de nadie más. No
// hace falta el cliente admin en ninguna consulta de esta página.
export default async function CpaPortalPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: entidades, error } = await supabase
    .from("business_entities")
    .select("id, name, entity_type, ein")
    .order("name", { ascending: true });

  const entityIds = (entidades ?? []).map((e) => e.id);

  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const ano = hoy.getFullYear();

  // IVU del mes en curso, para todas las entidades a la vez (1 query en vez
  // de N) — es lo que arma el "semáforo" por cliente en esta lista.
  const { data: ivuDelMes } = entityIds.length
    ? await supabase
        .from("ivu_tracker")
        .select("entity_id, ivu_net_due, due_date, deposit_status")
        .in("entity_id", entityIds)
        .eq("period_month", mes)
        .eq("period_year", ano)
    : { data: [] as never[] };

  const ivuPorEntidad = new Map((ivuDelMes ?? []).map((r) => [r.entity_id, r]));

  const totalPendiente = (ivuDelMes ?? [])
    .filter((r) => r.deposit_status !== "depositado")
    .reduce((acc, r) => acc + Number(r.ivu_net_due ?? 0), 0);

  // Próximo vencimiento de contribución estimada trimestral, across todos
  // los clientes — el resumen de arriba del mockup.
  const { data: proximoEstimado } = entityIds.length
    ? await supabase
        .from("estimated_tax_payments")
        .select("entity_id, amount_due, due_date")
        .in("entity_id", entityIds)
        .eq("status", "pendiente")
        .order("due_date", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const nombreEntidad = (id: string) => entidades?.find((e) => e.id === id)?.name ?? "";

  return (
    <div className="vc-shell">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
            V
          </div>
          <span className="text-base font-medium">VICTOR</span>
          <span className="ml-1 rounded-full border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">
            Portal CPA
          </span>
        </div>
        <span className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted">
          <i className="ti ti-lock" /> Solo lectura
        </span>
      </div>

      {entidades && entidades.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="vc-card">
            <p className="text-xs uppercase tracking-wide text-muted">IVU pendiente de depositar</p>
            <p className="mt-1 text-2xl font-semibold text-amb">{formatMoney(totalPendiente)}</p>
            <p className="mt-1 text-[11px] text-muted">Suma de todos tus clientes, periodo actual</p>
          </div>
          <div className="vc-card">
            <p className="text-xs uppercase tracking-wide text-muted">Contribución estimada — próximo vencimiento</p>
            {proximoEstimado ? (
              <>
                <p className="mt-1 text-2xl font-semibold">{formatMoney(Number(proximoEstimado.amount_due ?? 0))}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {nombreEntidad(proximoEstimado.entity_id)} · vence {proximoEstimado.due_date}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">Nada pendiente por ahora.</p>
            )}
          </div>
        </div>
      )}

      <div className="vc-card">
        <p className="mb-3 text-xs uppercase tracking-wide text-muted">
          Tus clientes {entidades ? `(${entidades.length})` : ""}
        </p>

        {error && <p className="text-xs text-red">No se pudieron cargar tus clientes: {error.message}</p>}

        {!error && (!entidades || entidades.length === 0) && (
          <p className="text-xs text-muted">
            Todavía no tienes clientes conectados. En cuanto un dueño te invite y aceptes, aparecerán aquí.
          </p>
        )}

        {entidades && entidades.length > 0 && (
          <div className="flex flex-col divide-y divide-border">
            {entidades.map((ent) => {
              const ivu = ivuPorEntidad.get(ent.id);
              return (
                <Link
                  key={ent.id}
                  href={`/cpa/${ent.id}`}
                  className="flex items-center justify-between py-3 hover:opacity-80"
                >
                  <div>
                    <p className="text-sm font-medium">{ent.name}</p>
                    <p className="text-xs text-muted">
                      {ent.entity_type} {ent.ein ? `· EIN ${ent.ein}` : ""}
                    </p>
                  </div>
                  {ivu ? (
                    <span
                      className={
                        "rounded-full px-2 py-1 text-[10px] font-medium " +
                        (ivu.deposit_status === "depositado"
                          ? "bg-grn/10 text-grn"
                          : ivu.deposit_status === "overdue"
                            ? "bg-red/10 text-red"
                            : "bg-amb/10 text-amb")
                      }
                    >
                      IVU {formatMoney(Number(ivu.ivu_net_due ?? 0))}
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted/10 px-2 py-1 text-[10px] text-muted">Sin datos IVU</span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
