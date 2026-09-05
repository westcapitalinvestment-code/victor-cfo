import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { Sensitive, PrivacyToggle } from "@/lib/privacy";
import { saludoPorHora, fechaHoyPR, diasHastaPR } from "@/lib/hora-pr";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";
import GastosPendientesCard from "../gastos-pendientes-card";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Mismos helpers que dashboard/page.tsx (Personal) — duplicados aquí a
// propósito, mismo patrón que el resto del código (cada Inicio trae su
// propia copia en vez de una dependencia cruzada por un par de líneas).
function primerDiaDelMesSiguiente(mesYYYYMM: string): string {
  const [anio, mes] = mesYYYYMM.split("-").map(Number);
  return new Date(anio, mes, 1).toISOString().slice(0, 10);
}

function etiquetaMes(mesYYYYMM: string): string {
  const [anio, mes] = mesYYYYMM.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, 1);
  const texto = new Intl.DateTimeFormat("es-PR", { month: "short", year: "numeric" }).format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace(".", "");
}

// Inicio de negocio — versión ligera del mockup "VICTOR — Dashboard Pro.html"
// (Inicio con contexto Negocio): saludo, balance/deuda de las cuentas
// asignadas a esta entidad, transacciones sin categorizar, metas del
// negocio, alertas y próxima cita — todo real, scoped por la entidad activa
// (mismo mecanismo que Facturación).
//
// Facturado/Cobrado/Pendiente y "Facturas recientes" se QUITARON de aquí
// (4 sept 2026, pedido de Joel: "quita la parte de facturas del home de
// negocio, si es lo mismo que esta en Facturas") — ese resumen ya vive en
// el portal de Facturación (pestaña Reportes/Facturas), mostrarlo dos
// veces era puro ruido duplicado. `todasFacturas` se queda solo para
// calcular las facturas vencidas que sí alimentan la tarjeta de Alertas.
//
// El balance/deuda (1 sept 2026, migración 0040) lee plaid_accounts.entity_id
// — el usuario asigna cada cuenta a su entidad desde /dashboard/cuentas
// ("Pertenece a"). Antes de esto no había forma de saber qué cuenta era de
// qué entidad, así que esta tarjeta no existía.
export default async function InicioNegocioPage({ searchParams }: { searchParams: { mes?: string } }) {
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

  // Selector de mes para Ingresos/Gastos (4 sept 2026, pedido de Joel: "el
  // dashboard de Negocio sea igual al de Personal") — mismo mecanismo que
  // dashboard/page.tsx, aquí filtrado además por entity_id. Ahorrado/Deuda/
  // Inversiones NO llevan este selector, mismo motivo que en Personal: son
  // el balance ACTUAL de la cuenta, no algo con historial por transacción.
  const mesActualStr = fechaHoyPR().slice(0, 7);
  const mesSeleccionado = searchParams.mes ?? mesActualStr;
  const inicioMesSel = `${mesSeleccionado}-01`;
  const finMesSel = primerDiaDelMesSiguiente(mesSeleccionado);

  const [
    { data: facturasRaw },
    { data: goals },
    { data: documentos },
    { data: cuentasNegocio },
    { data: citasProximasRaw },
    { data: transaccionesNegocioMes },
    { data: fechasTransaccionesNegocio },
  ] = await Promise.all([
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
        .select("current_balance, type, subtype")
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
      // Ingresos/Gastos del mes seleccionado — mismo query que Personal
      // (dashboard/page.tsx), filtrado por entity_id en vez de IS NULL.
      supabase
        .from("transactions")
        .select("amount, tipo_flujo")
        .eq("owner_id", user.id)
        .eq("entity_id", entidadId)
        .eq("es_duplicada", false)
        .gte("fecha", inicioMesSel)
        .lt("fecha", finMesSel),
      // Meses con transacciones reales de esta entidad, para las pills del
      // selector — mismo patrón que Personal.
      supabase
        .from("transactions")
        .select("fecha")
        .eq("owner_id", user.id)
        .eq("entity_id", entidadId)
        .order("fecha", { ascending: false })
        .limit(500),
    ]);

  const citasProximas = (citasProximasRaw ?? []).map((c) => ({ ...c, dias: diasHastaPR(c.fecha as string) }));

  const mesesDisponiblesNegocio = Array.from(
    new Set([mesActualStr, ...(fechasTransaccionesNegocio ?? []).map((t) => t.fecha.slice(0, 7))])
  )
    .sort()
    .slice(-12);

  const gastosDelMesNegocio = (transaccionesNegocioMes ?? []).reduce(
    (sum, t) => sum + (t.tipo_flujo === "gasto" ? Number(t.amount) : 0),
    0
  );
  const ingresosDelMesNegocio = (transaccionesNegocioMes ?? []).reduce(
    (sum, t) => sum + (t.tipo_flujo === "ingreso" ? Math.abs(Number(t.amount)) : 0),
    0
  );

  // Transacciones sin categorizar de ESTA entidad (4 sept 2026, reportado
  // por Joel: el Inicio de negocio debía ser igual al de Personal, y esta
  // tarjeta faltaba por completo aquí — solo existía en dashboard/page.tsx
  // con el filtro entity_id IS NULL, así que las transacciones de negocio
  // nunca aparecían pendientes en ningún lado). Mismo patrón exacto que
  // Personal, solo que filtrado por entity_id en vez de IS NULL.
  const LIMITE_PENDIENTES_NEGOCIO = 8;
  const [{ data: pendientesNegocioRaw }, { count: totalPendientesNegocio }, { data: categoriasNegocio }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, description_raw, amount, fecha, tipo_flujo, pending, plaid_account_id, manual_account_id")
      .eq("owner_id", user.id)
      .eq("entity_id", entidadId)
      .is("hacienda_category_id", null)
      .eq("es_duplicada", false)
      .eq("pending", false)
      .order("fecha", { ascending: false })
      .limit(LIMITE_PENDIENTES_NEGOCIO),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("entity_id", entidadId)
      .is("hacienda_category_id", null)
      .eq("es_duplicada", false)
      .eq("pending", false),
    supabase.from("hacienda_categories").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  // Nombres para mostrar junto a cada pendiente (mismo patrón que Personal,
  // dashboard/page.tsx) — solo cuentas Plaid YA asignadas a esta entidad.
  // Las cuentas manuales no tienen columna entity_id (solo es_negocio global,
  // ver nota en lib/victor/tools.ts), así que aquí se omiten a propósito en
  // vez de arriesgarse a etiquetar mal con la cuenta manual de otra entidad.
  const { data: cuentasPlaidParaLabelNegocio } = await supabase
    .from("plaid_accounts")
    .select("plaid_account_id, name, nickname, mask")
    .eq("owner_id", user.id)
    .eq("entity_id", entidadId);
  const nombrePorCuentaNegocio = new Map<string, string>();
  for (const c of cuentasPlaidParaLabelNegocio ?? []) {
    nombrePorCuentaNegocio.set(`plaid:${c.plaid_account_id}`, `${c.nickname || c.name || "Cuenta"}${c.mask ? ` ···${c.mask}` : ""}`);
  }
  const etiquetaDeTransaccionNegocio = (t: { plaid_account_id: string | null; manual_account_id: string | null }) =>
    (t.plaid_account_id && nombrePorCuentaNegocio.get(`plaid:${t.plaid_account_id}`)) || null;

  const pendientesNegocioConSugerencia = await Promise.all(
    (pendientesNegocioRaw ?? []).map(async (t) => {
      const { data: match } = await supabase
        .rpc("match_category", { p_raw_description: t.description_raw, p_entity_id: entidadId, p_tipo_flujo: t.tipo_flujo ?? null })
        .maybeSingle<{ hacienda_category_id: number | null }>();
      return { ...t, sugeridaId: match?.hacienda_category_id ?? null, cuentaLabel: etiquetaDeTransaccionNegocio(t) };
    })
  );

  const cuentasDeLaEntidad = cuentasNegocio ?? [];
  const cuentasLiquidasNegocio = cuentasDeLaEntidad.filter((c) => c.type === "depository");
  const balanceNegocio = cuentasLiquidasNegocio.reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
  // Ahorrado (4 sept 2026, paridad con Personal) — mismo criterio: solo el
  // subtipo "savings" dentro de las líquidas.
  const ahorradoNegocio = cuentasLiquidasNegocio
    .filter((c) => c.subtype === "savings")
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

  const facturasVencidas = todasFacturas.filter(estaVencida);

  const metasTotal = (goals ?? []).length;
  const metasAhorrado = (goals ?? []).reduce((s, g) => s + Number(g.current_amount), 0);
  const metasObjetivo = (goals ?? []).reduce((s, g) => s + Number(g.target_amount), 0);

  const en30dias = new Date();
  en30dias.setDate(en30dias.getDate() + 30);
  const en30diasISO = en30dias.toISOString().slice(0, 10);
  const documentosPorVencer = (documentos ?? []).filter((d) => d.fecha_vencimiento && d.fecha_vencimiento <= en30diasISO);

  const totalAlertas = facturasVencidas.length + documentosPorVencer.length;

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

      <GastosPendientesCard
        pendientesIniciales={pendientesNegocioConSugerencia}
        totalPendientes={totalPendientesNegocio ?? 0}
        categorias={categoriasNegocio ?? []}
        hrefBase="/dashboard/negocio/gastos"
      />

      {/* Selector de mes + 5 métricas — mismo bloque que Personal
          (dashboard/page.tsx), scoped a esta entidad (4 sept 2026, pedido de
          Joel: "el dashboard de Negocio sea igual al de Personal"). Antes
          esto era solo Deuda/Inversiones en un grid de 2 — faltaban
          Ingresos/Gastos/Ahorrado del mes, que sí tiene Personal. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted">Ingresos y Gastos de:</span>
        {mesesDisponiblesNegocio.map((m) => (
          <Link
            key={m}
            href={m === mesActualStr ? "/dashboard/negocio" : `/dashboard/negocio?mes=${m}`}
            className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${
              mesSeleccionado === m ? "border-teal text-teal" : "text-muted"
            }`}
            style={{ borderColor: mesSeleccionado === m ? undefined : "var(--border)" }}
          >
            {etiquetaMes(m)}
          </Link>
        ))}
      </div>

      <div className="vc-mets">
        <div className="vc-met">
          <p className="vc-ml">Ingresos</p>
          <p className={`vc-mv ${tieneCuentas && ingresosDelMesNegocio > 0 ? "!text-grn" : ""}`}>
            <Sensitive>{formatMoney(ingresosDelMesNegocio)}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{mesSeleccionado === mesActualStr ? "este mes" : etiquetaMes(mesSeleccionado)}</p>
        </div>
        <div className="vc-met">
          <p className="vc-ml">Gastos</p>
          <p className="vc-mv">
            <Sensitive>{formatMoney(gastosDelMesNegocio)}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{mesSeleccionado === mesActualStr ? "este mes" : etiquetaMes(mesSeleccionado)}</p>
        </div>
        <div className="vc-met">
          <p className="vc-ml">Ahorrado</p>
          <p className="vc-mv">
            <Sensitive>{tieneCuentas ? formatMoney(ahorradoNegocio) : "—"}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{tieneCuentas ? "en cuentas de ahorro" : "sin cuentas asignadas"}</p>
        </div>
        <div className="vc-met">
          <p className="vc-ml">Deuda</p>
          <p className={`vc-mv ${tieneCuentas && deudaNegocio > 0 ? "!text-red" : ""}`}>
            <Sensitive>{tieneCuentas ? formatMoney(deudaNegocio) : "—"}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{tieneCuentas ? "tarjetas y préstamos" : "sin cuentas asignadas"}</p>
        </div>
        <div className="vc-met">
          <p className="vc-ml">Inversiones</p>
          <p className="vc-mv">
            <Sensitive>{tieneCuentas ? formatMoney(inversionNegocio) : "—"}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{tieneCuentas ? "cuentas de inversión" : "sin cuentas asignadas"}</p>
        </div>
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
