import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sensitive, PrivacyToggle } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";
import { saludoPorHora } from "@/lib/hora-pr";
import GastosPendientesCard from "./gastos-pendientes-card";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, onboarding_completed, plan")
    .eq("id", user.id)
    .single();

  if (!profile?.onboarding_completed) redirect("/onboarding");

  const esPro = profile.plan === "pro" || profile.plan === "proplus";

  const firstName = (profile.full_name || user.email || "").split(" ")[0];
  const hoy = new Date();
  const fechaLbl = hoy.toLocaleDateString("es-PR", { weekday: "long", day: "numeric", month: "long" });

  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const { data: transacciones } = await supabase
    .from("transactions")
    .select("amount")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .gte("fecha", inicioMes);

  const gastosDelMes = (transacciones ?? []).reduce((sum, t) => sum + (t.amount > 0 ? Number(t.amount) : 0), 0);

  let cuentasQuery = supabase
    .from("plaid_accounts")
    .select("current_balance, es_negocio, type, subtype")
    .eq("owner_id", user.id);
  if (!esPro) cuentasQuery = cuentasQuery.eq("es_negocio", false);
  const { data: cuentasPlaid } = await cuentasQuery;

  const bancoConectado = !!cuentasPlaid && cuentasPlaid.length > 0;

  const cuentasLiquidas = (cuentasPlaid ?? []).filter((c) => c.type === "depository");
  const balanceTotal = cuentasLiquidas.reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  const ahorrado = cuentasLiquidas
    .filter((c) => c.subtype === "savings")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  const deudaTotal = (cuentasPlaid ?? [])
    .filter((c) => c.type === "credit" || c.type === "loan")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  let cuentasNegocioOcultas = 0;
  if (!esPro) {
    const { count } = await supabase
      .from("plaid_accounts")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("es_negocio", true);
    cuentasNegocioOcultas = count ?? 0;
  }

  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("id, name, target_amount, current_amount")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .eq("status", "activa")
    .order("created_at", { ascending: false })
    .limit(3);

  const en90dias = new Date(hoy.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: docsPorVencerRaw } = await supabase
    .from("documents")
    .select("id, nombre, fecha_vencimiento")
    .eq("owner_id", user.id)
    .eq("estado", "activo")
    .not("fecha_vencimiento", "is", null)
    .lte("fecha_vencimiento", en90dias)
    .order("fecha_vencimiento", { ascending: true })
    .limit(3);

  const docsPorVencer = (docsPorVencerRaw ?? []).map((d) => {
    const dias = Math.ceil((new Date(d.fecha_vencimiento).getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000));
    return { ...d, dias };
  });

  const LIMITE_PENDIENTES = 8;
  const [{ data: pendientesRaw }, { count: totalPendientes }, { data: categorias }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, description_raw, amount, fecha")
      .eq("owner_id", user.id)
      .is("entity_id", null)
      .is("hacienda_category_id", null)
      .order("fecha", { ascending: false })
      .limit(LIMITE_PENDIENTES),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .is("entity_id", null)
      .is("hacienda_category_id", null),
    supabase.from("hacienda_categories").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  const pendientesConSugerencia = await Promise.all(
    (pendientesRaw ?? []).map(async (t) => {
      const { data: match } = await supabase
        .rpc("match_category", { p_raw_description: t.description_raw, p_entity_id: null })
        .maybeSingle<{ hacienda_category_id: number | null }>();
      return { ...t, sugeridaId: match?.hacienda_category_id ?? null };
    })
  );

  return (
    <div className="vc-shell">
      <div className="mb-4">
        <p className="text-xl font-medium">{saludoPorHora(hoy)}, {firstName} 👋</p>
        <p className="mt-0.5 text-xs capitalize text-muted">{fechaLbl} · Personal</p>
      </div>

      <div className="vc-bal">
        <div className="flex items-start justify-between">
          <div>
            <p className="vc-bal-lbl">Balance personal</p>
            <p className="vc-bal-amt">
              <Sensitive>{bancoConectado ? formatMoney(balanceTotal) : "—"}</Sensitive>
            </p>
          </div>
          <PrivacyToggle />
        </div>
        {!bancoConectado && (
          <Link href="/dashboard/cuentas" className="mt-2 inline-block text-xs font-medium text-white underline">
            Conecta tu banco para verlo →
          </Link>
        )}
        {cuentasNegocioOcultas > 0 && (
          <p className="mt-2 text-xs text-white/80">
            Detectamos {cuentasNegocioOcultas} cuenta{cuentasNegocioOcultas > 1 ? "s" : ""} que parece
            {cuentasNegocioOcultas > 1 ? "n" : ""} de negocio — no la
            {cuentasNegocioOcultas > 1 ? "s" : ""} contamos aquí. Actívala con{" "}
            <Link href="/dashboard/equipo" className="underline">
              VICTOR Pro
            </Link>{" "}
            para verla{cuentasNegocioOcultas > 1 ? "s" : ""}.
          </p>
        )}
      </div>

      <GastosPendientesCard
        pendientesIniciales={pendientesConSugerencia}
        totalPendientes={totalPendientes ?? 0}
        categorias={categorias ?? []}
      />

      <div className="vc-mets">
        <div className="vc-met">
          <p className="vc-ml">Gastos</p>
          <p className="vc-mv">
            <Sensitive>{formatMoney(gastosDelMes)}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">este mes</p>
        </div>
        <div className="vc-met">
          <p className="vc-ml">Ahorrado</p>
          <p className="vc-mv">
            <Sensitive>{bancoConectado ? formatMoney(ahorrado) : "—"}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{bancoConectado ? "en cuentas de ahorro" : "conecta tu banco"}</p>
        </div>
        <div className="vc-met">
          <p className="vc-ml">Deuda</p>
          <p className={`vc-mv ${bancoConectado && deudaTotal > 0 ? "text-red" : ""}`}>
            <Sensitive>{bancoConectado ? formatMoney(deudaTotal) : "—"}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{bancoConectado ? "tarjetas y préstamos" : "conecta tu banco"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="vc-card !p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Metas</p>
            <Link href="/dashboard/metas/nueva" className="text-xs font-medium text-teal hover:opacity-80">
              + Nueva
            </Link>
          </div>
          <div className="p-4">
            {goalsError && <p className="text-xs text-amb">No se pudo leer goals ({goalsError.message}).</p>}
            {!goalsError && (!goals || goals.length === 0) && (
              <p className="text-xs text-muted">Sin metas todavía. Dale a "+ Nueva" para crear la primera.</p>
            )}
            {goals && goals.length > 0 && (
              <div>
                {goals.map((g) => {
                  const pct = g.target_amount > 0 ? Math.min(100, Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100)) : 0;
                  return (
                    <div key={g.id} className="vc-goal">
                      <div className="vc-goal-row">
                        <span>{g.name}</span>
                        <span className="text-muted">{pct}%</span>
                      </div>
                      <div className="vc-bar">
                        <div className="vc-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="vc-card !p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Alertas</p>
            <Link href="/dashboard/documentos/nuevo" className="text-xs font-medium text-teal hover:opacity-80">
              + Nuevo
            </Link>
          </div>
          <div className="p-4">
            {docsPorVencer.length === 0 && (
              <p className="text-xs text-muted">Sin alertas pendientes.</p>
            )}
            {docsPorVencer.length > 0 && (
              <div>
                {docsPorVencer.map((d) => {
                  const color = d.dias <= 7 ? "var(--red)" : d.dias <= 30 ? "var(--amb)" : "var(--grn)";
                  return (
                    <div key={d.id} className="vc-alert">
                      <div className="vc-adot" style={{ background: color }} />
                      <div>
                        <p className="text-xs text-text">{d.nombre}</p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {d.dias < 0 ? "Venció" : `Vence en ${d.dias} días`} · {d.fecha_vencimiento}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
