import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { Sensitive, PrivacyToggle } from "@/lib/privacy";
import { saludoPorHora, fechaHoyPR, diasHastaPR } from "@/lib/hora-pr";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Inicio de negocio — versión ligera del mockup "VICTOR — Dashboard Pro.html"
// (Inicio con contexto Negocio): saludo, balance/deuda de las cuentas
// asignadas a esta entidad, Facturado/Cobrado/Pendiente, facturas
// recientes, metas del negocio, alertas — todo real, scoped por la entidad
// activa (mismo mecanismo que Facturación).
//
// El balance/deuda (1 sept 2026, migración 0040) lee plaid_accounts.entity_id
// — el usuario asigna cada cuenta a su entidad desde /dashboard/cuentas
// ("Pertenece a"). Antes de esto no había forma de saber qué cuenta era de
// qué entidad, así que esta tarjeta no existía.
export default async function InicioNegocioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("full_name, onboarding_completed").eq("id", user.id).maybeSingle();
  if (!profile?.onboarding_completed) redirect("/onboarding");
  const firstName = (profile.full_name || user.email || "").split(" ")[0];

  const { data: entidades } = await supabase
    .from("business_entities")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!entidades || entidades.length === 0) {
    return (
      <div className="vc-shell">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Todavía no tienes ninguna entidad de negocio.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi negocio
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
          <p className="text-sm text-muted">Elige una entidad específica en el selector de arriba para ver su Inicio.</p>
        </div>
      </div>
    );
  }

  const entidadActiva = entidades.find((e) => e.id === entidadId);

  const hoyStrPR = fechaHoyPR();

  const [{ data: facturasRaw }, { data: goals }, { data: documentos }, { data: cuentasNegocio }, { data: citasProximasRaw }] =
    await Promise.all([
      supabase
        .from("invoices")
        .select("id, numero, total, estado, fecha_emision, fecha_vencimiento, client_id, clients(name)")
        .eq("owner_id", user.id)
        .eq("entity_id", entidadId)
        .order("fecha_emision", { ascending: false }),
      supabase
        .from("goals")
        .select("id, current_amount, target_amount")
        .eq("owner_id", user.id)
        .eq("entity_id", entidadId),
      supabase
        .from("documents")
        .select("id, nombre, fecha_vencimiento")
        .eq("owner_id", user.id)
        .eq("entity_id", entidadId)
        .not("fecha_vencimiento", "is", null)
        .order("fecha_vencimiento", { ascending: true }),
      supabase
        .from("plaid_accounts")
        .select("current_balance, type")
        .eq("owner_id", user.id)
        .eq("entity_id", entidadId),
      // Próxima cita (1 sept 2026, migración 0041) — mismo criterio que
      // Personal (dashboard/page.tsx): hecha=false, desde hoy en adelante.
      supabase
        .from("citas")
        .select("id, titulo, fecha, hora, costo_estimado")
        .eq("owner_id", user.id)
        .eq("entity_id", entidadId)
        .eq("hecha", false)
        .gte("fecha", hoyStrPR)
        .order("fecha", { ascending: true })
        .limit(3),
    ]);

  const citasProximas = (citasProximasRaw ?? []).map((c) => ({ ...c, dias: diasHastaPR(c.fecha as string) }));

  const cuentasDeLaEntidad = cuentasNegocio ?? [];
  const balanceNegocio = cuentasDeLaEntidad
    .filter((c) => c.type === "depository")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
  const deudaNegocio = cuentasDeLaEntidad
    .filter((c) => c.type === "credit" || c.type === "loan")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
  // Inversiones (1 sept 2026) — mismo criterio que Personal (dashboard/page.tsx):
  // cuentas type "investment" conectadas por Plaid y asignadas a esta entidad.
  const inversionNegocio = cuentasDeLaEntidad
    .filter((c) => c.type === "investment")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
  const tieneCuentas = cuentasDeLaEntidad.length > 0;

  // Supabase tipa la relación clients(name) como arreglo por defecto — se
  // castea a objeto único aquí, mismo truco que ya usa facturacion/page.tsx
  // al pasarle `facturas` a <FacturacionPortal facturas={... as any} />.
  const todasFacturas = (facturasRaw ?? []) as unknown as {
    id: string;
    numero: string;
    total: number;
    estado: string;
    fecha_emision: string;
    fecha_vencimiento: string | null;
    client_id: string | null;
    clients: { name: string } | null;
  }[];
  const estaVencida = (f: (typeof todasFacturas)[number]) =>
    f.estado !== "pagada" && f.estado !== "borrador" && !!f.fecha_vencimiento && f.fecha_vencimiento < hoyISO();

  const noBorrador = todasFacturas.filter((f) => f.estado !== "borrador");
  const facturado = noBorrador.reduce((s, f) => s + Number(f.total), 0);
  const cobrado = todasFacturas.filter((f) => f.estado === "pagada").reduce((s, f) => s + Number(f.total), 0);
  const pendiente = todasFacturas
    .filter((f) => f.estado === "enviada" && !estaVencida(f))
    .reduce((s, f) => s + Number(f.total), 0);
  const facturasVencidas = todasFacturas.filter(estaVencida);

  const recientes = todasFacturas.slice(0, 3);

  const metasTotal = (goals ?? []).length;
  const metasAhorrado = (goals ?? []).reduce((s, g) => s + Number(g.current_amount), 0);
  const metasObjetivo = (goals ?? []).reduce((s, g) => s + Number(g.target_amount), 0);

  const en30dias = new Date();
  en30dias.setDate(en30dias.getDate() + 30);
  const en30diasISO = en30dias.toISOString().slice(0, 10);
  const documentosPorVencer = (documentos ?? []).filter((d) => d.fecha_vencimiento && d.fecha_vencimiento <= en30diasISO);

  const totalAlertas = facturasVencidas.length + documentosPorVencer.length;

  function estadoBadge(f: (typeof todasFacturas)[number]) {
    if (f.estado === "pagada") return { texto: "Pagada", color: "#1D9E75" };
    if (estaVencida(f)) return { texto: "Vencida", color: "#B7304A" };
    if (f.estado === "borrador") return { texto: "Borrador", color: "var(--muted)" };
    return { texto: "Vista sin pagar", color: "#8B6BD1" };
  }

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xl font-medium">{saludoPorHora(new Date())}, {firstName} 👋</p>
          <p className="mt-0.5 text-xs text-muted">{entidadActiva?.name} · Negocio</p>
        </div>
        <Link href="/dashboard/facturacion/nueva" className="vc-btn-primary inline-flex items-center gap-1 !w-auto px-4 py-2 text-xs">
          + Factura
        </Link>
      </div>

      {/* BALANCE — mismo componente vc-bal que usa Personal (dashboard/page.tsx),
          para que el Inicio de negocio se vea y se sienta igual. Si la entidad
          todavía no tiene cuentas asignadas, mismo estado vacío honesto que
          Personal usa cuando no hay banco conectado. */}
      <div className="vc-bal">
        <div className="flex items-start justify-between">
          <div>
            <p className="vc-bal-lbl">Balance de negocio</p>
            <p className="vc-bal-amt">
              <Sensitive>{tieneCuentas ? formatMoney(balanceNegocio) : "—"}</Sensitive>
            </p>
          </div>
          <PrivacyToggle />
        </div>
        {!tieneCuentas && (
          <Link href="/dashboard/cuentas" className="mt-2 inline-block text-xs font-medium text-white underline">
            Asigna una cuenta a esta entidad →
          </Link>
        )}
      </div>

      {tieneCuentas && (
        <div className="vc-mets" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="vc-met">
            <p className="vc-ml">Deuda</p>
            <p className="vc-mv" style={{ color: deudaNegocio > 0 ? "var(--red)" : undefined }}>
              <Sensitive>{formatMoney(deudaNegocio)}</Sensitive>
            </p>
            <p className="mt-0.5 text-[10px] text-muted">tarjetas y préstamos</p>
          </div>
          <div className="vc-met">
            <p className="vc-ml">Inversiones</p>
            <p className="vc-mv">
              <Sensitive>{formatMoney(inversionNegocio)}</Sensitive>
            </p>
            <p className="mt-0.5 text-[10px] text-muted">cuentas de inversión</p>
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="vc-card text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted">Facturado</p>
          <p className="mt-1 text-lg font-medium">{formatMoney(facturado)}</p>
          <p className="text-[10px] text-muted">{noBorrador.length} facturas</p>
        </div>
        <div className="vc-card text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted">Cobrado</p>
          <p className="mt-1 text-lg font-medium" style={{ color: "#1D9E75" }}>
            {formatMoney(cobrado)}
          </p>
          <p className="text-[10px] text-muted">{facturado > 0 ? Math.round((cobrado / facturado) * 100) : 0}%</p>
        </div>
        <div className="vc-card text-center">
          <p className="text-[10px] uppercase tracking-wide text-muted">Pendiente</p>
          <p className="mt-1 text-lg font-medium" style={{ color: "#B7860F" }}>
            {formatMoney(pendiente)}
          </p>
          <p className="text-[10px] text-muted">
            {todasFacturas.filter((f) => f.estado === "enviada" && !estaVencida(f)).length} fact.
          </p>
        </div>
      </div>

      <div className="vc-card mb-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted">Facturas recientes</p>
          <Link href="/dashboard/facturacion" className="text-xs font-medium text-teal hover:opacity-80">
            ver portal →
          </Link>
        </div>

        {recientes.length === 0 && <p className="py-3 text-center text-sm text-muted">Sin facturas todavía.</p>}

        {recientes.map((f) => {
          const badge = estadoBadge(f);
          return (
            <Link
              key={f.id}
              href={`/dashboard/facturacion/${f.id}`}
              className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0"
            >
              <div>
                <p>{f.clients?.name ?? "Sin cliente"}</p>
                <p className="text-xs text-muted">
                  #{f.numero} · {f.fecha_emision}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatMoney(Number(f.total))}</p>
                <p className="text-xs" style={{ color: badge.color }}>
                  {badge.texto}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Metas / Alertas / Próxima cita — mismo grid de 2 columnas que usa
          Personal (dashboard/page.tsx) para las mismas 3 tarjetas. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="vc-card !p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Metas</p>
            <Link href="/dashboard/negocio/metas/nueva" className="text-xs font-medium text-teal hover:opacity-80">
              + Nueva
            </Link>
          </div>
          <div className="p-4">
            {metasTotal === 0 ? (
              <p className="text-xs text-muted">Sin metas de negocio todavía.</p>
            ) : (
              <p className="text-sm text-muted">
                <Sensitive>
                  {formatMoney(metasAhorrado)} / {formatMoney(metasObjetivo)}
                </Sensitive>{" "}
                · {metasTotal} meta{metasTotal === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>

        <div className="vc-card !p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Alertas {totalAlertas > 0 && <span className="ml-1 rounded bg-amb/20 px-1.5 py-0.5 text-[10px] text-amb">{totalAlertas}</span>}
            </p>
            <Link href="/dashboard/negocio/documentos/nuevo" className="text-xs font-medium text-teal hover:opacity-80">
              + Nuevo
            </Link>
          </div>
          <div className="p-4">
            {totalAlertas === 0 && <p className="text-xs text-muted">Todo al día.</p>}

            {facturasVencidas.map((f) => (
              <div key={f.id} className="vc-alert">
                <div className="vc-adot" style={{ background: "#B7304A" }} />
                <div className="flex-1">
                  <p className="text-xs text-text">Factura vencida — {f.clients?.name ?? "Sin cliente"}</p>
                  <Link href={`/dashboard/facturacion/${f.id}`} className="mt-0.5 inline-block text-[10px] font-medium text-teal">
                    Cobrar →
                  </Link>
                </div>
              </div>
            ))}

            {documentosPorVencer.map((d) => (
              <div key={d.id} className="vc-alert">
                <div className="vc-adot" style={{ background: "var(--amb)" }} />
                <div className="flex-1">
                  <p className="text-xs text-text">{d.nombre} vence {d.fecha_vencimiento}</p>
                  <Link href="/dashboard/negocio/documentos" className="mt-0.5 inline-block text-[10px] font-medium text-teal">
                    Ver →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="vc-card !p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Próxima cita</p>
            <Link href="/dashboard/negocio/citas/nueva" className="text-xs font-medium text-teal hover:opacity-80">
              + Nueva
            </Link>
          </div>
          <div className="p-4">
            {citasProximas.length === 0 && <p className="text-xs text-muted">Sin citas pendientes.</p>}
            {citasProximas.length > 0 && (
              <div>
                {citasProximas.map((c) => {
                  const color = c.dias <= 1 ? "var(--red)" : c.dias <= 3 ? "var(--amb)" : "var(--grn)";
                  const cuando = c.dias === 0 ? "Hoy" : c.dias === 1 ? "Mañana" : `En ${c.dias} días`;
                  return (
                    <Link
                      key={c.id}
                      href={`/dashboard/citas/${c.id}/editar?volver=/dashboard/negocio`}
                      className="vc-alert"
                    >
                      <div className="vc-adot" style={{ background: color }} />
                      <div>
                        <p className="text-xs text-text">{c.titulo}</p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {cuando} · {c.fecha}
                          {c.hora && ` · ${c.hora}`}
                          {c.costo_estimado !== null && ` · $${Number(c.costo_estimado).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                        </p>
                      </div>
                    </Link>
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
