import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sensitive, PrivacyToggle } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";
import { saludoPorHora, fechaHoyPR, diasHastaPR } from "@/lib/hora-pr";
import GastosPendientesCard from "./gastos-pendientes-card";

// Primer día del mes SIGUIENTE a "YYYY-MM" — mismo helper que en
// /dashboard/gastos/page.tsx, copiado aquí para no crear una dependencia
// cruzada entre las dos páginas por un par de líneas.
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

// Pantalla "Inicio" real — vista Personal, calcada de
// VICTOR — Dashboard Core.html (id="inicio-personal"). Es la base de Core:
// balance, gastos del mes, metas, alertas. Sin nada de Negocio/Facturación
// (eso es Pro+, se muestra más adelante como upgrade sobre esta misma base).
//
// A diferencia del mockup, los números NO son de ejemplo — son consultas
// reales a Supabase. Donde todavía no hay datos (Plaid sin conectar,
// ninguna meta creada), se muestra un estado vacío honesto en vez de
// inventar cifras.
export default async function DashboardPage({ searchParams }: { searchParams: { mes?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // .maybeSingle() en vez de .single() (30 agosto 2026) — mismo fix que en
  // onboarding/page.tsx: .single() truena en vez de devolver null cuando la
  // fila no vuelve, y ese error quedaba invisible porque solo se miraba
  // `data`, causando un rebote a /onboarding sin explicación.
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, onboarding_completed, plan")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed) redirect("/onboarding");

  const esPro = profile.plan === "pro" || profile.plan === "proplus";

  const firstName = (profile.full_name || user.email || "").split(" ")[0];
  const hoy = new Date();
  // timeZone explícito — sin esto, toLocaleDateString usa la hora del
  // servidor (UTC en Vercel), y pasada cierta hora de la noche en PR
  // (UTC-4) ya es el día SIGUIENTE en UTC, mostrando la fecha equivocada
  // aunque el saludo de arriba (saludoPorHora, que sí especifica la zona)
  // estuviera correcto. Mismo patrón que el resto de lib/hora-pr.ts.
  const fechaLbl = hoy.toLocaleDateString("es-PR", {
    timeZone: "America/Puerto_Rico",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Ingresos/Gastos del mes ahora tienen su propio selector de mes en
  // pantalla (igual que en /dashboard/gastos) — antes esto era siempre
  // "el mes en curso" a fuego, sin forma de ver "cuánto gasté en julio"
  // desde el Inicio sin ir a la pestaña Gastos. Ahorrado/Deuda a propósito
  // NO tienen este selector: son el balance ACTUAL de la cuenta en Plaid
  // ("cuánto tienes/debes hoy"), no algo con historial por transacción —
  // Plaid no manda "cuánto tenías ahorrado en marzo", así que ponerles el
  // mismo selector mostraría el mismo número de hoy sin importar el mes
  // elegido, que confunde más de lo que ayuda.
  const mesActualStr = fechaHoyPR().slice(0, 7);
  const mesSeleccionado = searchParams.mes ?? mesActualStr;
  const inicioMesSel = `${mesSeleccionado}-01`;
  const finMesSel = primerDiaDelMesSiguiente(mesSeleccionado);

  // Gastos/Ingresos del mes seleccionado — transactions personales
  // (entity_id null) dentro del rango exacto del mes, no solo "desde el
  // día 1 en adelante" como antes (eso solo servía para "el mes en
  // curso"; un mes pasado necesita también un límite superior).
  // Convención: amount positivo = dinero que sale (gasto). Sin Plaid
  // conectado todavía, esto da 0 filas — resultado real: $0.00, no un
  // número inventado.
  const { data: transacciones } = await supabase
    .from("transactions")
    .select("amount, tipo_flujo")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .gte("fecha", inicioMesSel)
    .lt("fecha", finMesSel);

  // Meses con transacciones reales (más el mes actual, aunque todavía no
  // tenga ninguna) para pintar como pills — mismo patrón que
  // mesesDisponibles en /dashboard/gastos. Query aparte y liviana (solo la
  // columna fecha) porque la de arriba ya viene acotada a un solo mes.
  const { data: fechasTransacciones } = await supabase
    .from("transactions")
    .select("fecha")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .order("fecha", { ascending: false })
    .limit(500);
  const mesesDisponibles = Array.from(new Set([mesActualStr, ...(fechasTransacciones ?? []).map((t) => t.fecha.slice(0, 7))]))
    .sort()
    .slice(-12);

  // tipo_flujo === "gasto" en vez de amount > 0 — un pago de tarjeta hecho
  // desde esta cuenta es "transferencia" (no gasto nuevo), y en cuentas de
  // crédito el signo funciona al revés. Ver migración 0016_tipo_flujo.sql.
  const gastosDelMes = (transacciones ?? []).reduce((sum, t) => sum + (t.tipo_flujo === "gasto" ? Number(t.amount) : 0), 0);

  // Ingresos del mes — mismo criterio (tipo_flujo, no el signo del monto) y
  // mismo query ya traído arriba. Se muestra en Inicio, antes de Gastos, para
  // que de un vistazo se vea qué entró vs. qué salió — sin esto, un usuario
  // con una transacción categorizada como "transferencia" o "ingreso" no
  // tenía forma de saber por qué no aparecía como gasto.
  // Math.abs() porque un "ingreso" se guarda con monto NEGATIVO en la base
  // de datos (positivo = salió, negativo = entró — misma convención que
  // gastosDelMes de arriba, que no lo necesita porque "gasto" ya es
  // positivo). Sin esto la tarjeta mostraba el total de ingresos en rojo
  // y en negativo, como si fuera deuda.
  const ingresosDelMes = (transacciones ?? []).reduce((sum, t) => sum + (t.tipo_flujo === "ingreso" ? Math.abs(Number(t.amount)) : 0), 0);

  // Balance real — si ya conectó al menos un banco por Plaid, sumamos el
  // balance actual de sus cuentas. Si el plan es Core, las cuentas que
  // parecen de negocio (es_negocio, detectado al conectar el banco) NO
  // cuentan aquí — Plaid trae todas las cuentas bajo un mismo login, así
  // que sin este filtro alguien podría conectar su cuenta de negocio y
  // verla gratis sin pagar Pro.
  // entity_id (migración 0040, 1 sept 2026): una cuenta ya asignada a una
  // entidad de negocio desde /dashboard/cuentas ("Pertenece a") deja de
  // contar aquí — su balance/deuda ahora vive en el Inicio de esa entidad
  // (app/dashboard/negocio/page.tsx). Antes esto solo miraba es_negocio
  // (el detector automático), así que una cuenta ya asignada a mano
  // seguía sumando en Personal aunque el usuario la hubiera movido.
  let cuentasQuery = supabase
    .from("plaid_accounts")
    .select("current_balance, es_negocio, type, subtype, entity_id")
    .eq("owner_id", user.id)
    .is("entity_id", null);
  if (!esPro) cuentasQuery = cuentasQuery.eq("es_negocio", false);
  const { data: cuentasPlaid } = await cuentasQuery;

  // Cuentas manuales (sin Plaid — ej. Apple Card) cuentan igual que las de
  // Plaid en todos estos totales. Mismo filtro de negocio para Core.
  let manualesQuery = supabase
    .from("manual_accounts")
    .select("current_balance, es_negocio, type, subtype")
    .eq("owner_id", user.id);
  if (!esPro) manualesQuery = manualesQuery.eq("es_negocio", false);
  const { data: cuentasManuales } = await manualesQuery;

  const todasLasCuentas = [...(cuentasPlaid ?? []), ...(cuentasManuales ?? [])];
  const bancoConectado = todasLasCuentas.length > 0;

  // "Balance personal" = solo dinero líquido de verdad (checking + savings,
  // type "depository"). No se resta la deuda aquí — una deuda a largo
  // plazo (préstamo de carro, tarjeta) no afecta cuánto efectivo tienes
  // disponible HOY mientras esté al día. Mezclar ambas cosas en un solo
  // número confunde "cuánto tengo" con "cuánto debo" — por eso Ahorrado y
  // Deuda se calculan y se muestran aparte, abajo.
  const cuentasLiquidas = todasLasCuentas.filter((c) => c.type === "depository");
  const balanceTotal = cuentasLiquidas.reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  // Ahorrado: solo el subtipo "savings" dentro de las líquidas — checking
  // es dinero de flujo normal, no cuenta como "ahorro".
  const ahorrado = cuentasLiquidas
    .filter((c) => c.subtype === "savings")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  // Deuda: tarjetas de crédito y préstamos. Plaid siempre manda esto como
  // número positivo ("cuánto debes"), así que se suma tal cual — nunca se
  // resta del balance líquido de arriba. Las cuentas manuales de tipo
  // credit/loan siguen la misma convención (el usuario entra "cuánto debe"
  // como número positivo también).
  const deudaTotal = todasLasCuentas
    .filter((c) => c.type === "credit" || c.type === "loan")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  // Inversiones (ej. Acorn como cuenta manual): antes no se sumaban en
  // NINGÚN número del Inicio (ni Balance, ni Ahorrado, ni Deuda las
  // filtran, porque ninguna busca type === "investment") — el dinero
  // estaba ahí y solo se veía entrando a Cuentas. Se calcula y se muestra
  // aparte, no mezclado con Balance personal, por la misma razón que
  // Ahorrado/Deuda están separados: "cuánto tengo líquido hoy" es una
  // pregunta distinta de "cuánto tengo invertido".
  const inversionTotal = todasLasCuentas
    .filter((c) => c.type === "investment")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  // Si es Core, contamos también cuántas cuentas de negocio detectamos
  // pero dejamos afuera, para avisarle con honestidad en vez de esconderlo.
  let cuentasNegocioOcultas = 0;
  if (!esPro) {
    const [{ count: countPlaid }, { count: countManuales }] = await Promise.all([
      supabase
        .from("plaid_accounts")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("es_negocio", true),
      supabase
        .from("manual_accounts")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("es_negocio", true),
    ]);
    cuentasNegocioOcultas = (countPlaid ?? 0) + (countManuales ?? 0);
  }

  // Metas — tabla goals (0007), personales (entity_id null).
  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("id, name, target_amount, current_amount")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .eq("status", "activa")
    .order("created_at", { ascending: false })
    .limit(3);

  // Alertas — documentos por vencer. Las columnas alerta_90/30/7 en `documents`
  // solo se llenan con un cron job que todavía no existe, así que la urgencia
  // se calcula aquí mismo a partir de fecha_vencimiento — siempre correcto,
  // sin depender de un job que corra a diario.
  // fechaHoyPR()/diasHastaPR() en vez de new Date() crudo — bug real (30
  // agosto 2026, reportado por Joel): comparar el INSTANTE real del
  // servidor (UTC en Vercel) contra fechas de calendario hacía que, pasada
  // cierta hora de la tarde/noche en Puerto Rico (4 horas detrás de UTC),
  // un documento o cita de MAÑANA se reportara como que es HOY. Ver la
  // nota grande junto a diasHastaPR() en lib/hora-pr.ts.
  const hoyStrPR = fechaHoyPR(hoy);
  const en90dias = new Date(new Date(`${hoyStrPR}T00:00:00Z`).getTime() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
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
    const dias = diasHastaPR(d.fecha_vencimiento as string, hoy);
    return { ...d, dias };
  });

  // Próximas citas (0030) — mismo criterio de ventana que documentos, pero
  // sin cron de por medio: "hecha = false" y fecha desde hoy en adelante,
  // calculado aquí mismo para que siempre esté correcto. hoyStrPR (no
  // hoy.toISOString()) también evita que una cita de HOY MISMO desaparezca
  // de la lista si se consulta de noche en Puerto Rico — ver nota arriba.
  const { data: citasProximasRaw } = await supabase
    .from("citas")
    .select("id, titulo, fecha, hora, costo_estimado")
    .eq("owner_id", user.id)
    .eq("hecha", false)
    .gte("fecha", hoyStrPR)
    .order("fecha", { ascending: true })
    .limit(3);

  const citasProximas = (citasProximasRaw ?? []).map((c) => {
    const dias = diasHastaPR(c.fecha as string, hoy);
    return { ...c, dias };
  });

  // Gastos sin categorizar — lo que el motor (trigger_auto_categorize, en
  // 0001) NO pudo decidir solo al llegar la transacción. Se muestra aquí en
  // el Inicio, no escondido en Gastos, porque es justo lo que el usuario
  // tiene que resolver — calcado del mockup original (VICTOR — Dashboard
  // Core.html), donde esto vivía como alerta pendiente en la primera
  // pantalla, no en una pestaña aparte.
  const LIMITE_PENDIENTES = 8;
  const [{ data: pendientesRaw }, { count: totalPendientes }, { data: categorias }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, description_raw, amount, fecha, tipo_flujo, pending, plaid_account_id, manual_account_id")
      .eq("owner_id", user.id)
      .is("entity_id", null)
      .is("hacienda_category_id", null)
      // Mientras está pendiente, el banco todavía puede reemplazarla por una
      // versión posteada con otro plaid_transaction_id (ver lib/plaid-sync.ts,
      // fix del 23 de agosto) — pedirle al usuario que categorice algo que
      // puede desaparecer y reaparecer con otro ID es justo lo que causaba
      // los "duplicados ya categorizados". Se espera a que postee.
      .eq("pending", false)
      .order("fecha", { ascending: false })
      .limit(LIMITE_PENDIENTES),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .is("entity_id", null)
      .is("hacienda_category_id", null)
      .eq("pending", false),
    supabase.from("hacienda_categories").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  // Bug real (23 agosto 2026, reportado por Joel): con dos cuentas
  // "checking" del mismo banco (nombres iguales o parecidos), esta lista no
  // decía de cuál venía cada transacción — imposible categorizar bien sin
  // adivinar. Mismo patrón de nombrePorCuenta que ya usa /dashboard/gastos,
  // ahora también prefiriendo el nickname (migración 0024) sobre el nombre
  // que manda el banco.
  const [{ data: cuentasPlaidParaLabel }, { data: cuentasManualesParaLabel }] = await Promise.all([
    supabase.from("plaid_accounts").select("plaid_account_id, name, nickname, mask").eq("owner_id", user.id),
    supabase.from("manual_accounts").select("id, name, mask").eq("owner_id", user.id),
  ]);
  const nombrePorCuenta = new Map<string, string>();
  for (const c of cuentasPlaidParaLabel ?? []) {
    nombrePorCuenta.set(`plaid:${c.plaid_account_id}`, `${c.nickname || c.name || "Cuenta"}${c.mask ? ` ···${c.mask}` : ""}`);
  }
  for (const c of cuentasManualesParaLabel ?? []) {
    nombrePorCuenta.set(`manual:${c.id}`, `${c.name || "Cuenta"}${c.mask ? ` ···${c.mask}` : ""}`);
  }
  const etiquetaDeTransaccion = (t: { plaid_account_id: string | null; manual_account_id: string | null }) =>
    (t.plaid_account_id && nombrePorCuenta.get(`plaid:${t.plaid_account_id}`)) ||
    (t.manual_account_id && nombrePorCuenta.get(`manual:${t.manual_account_id}`)) ||
    null;

  // Para cada pendiente, le pedimos al motor una sugerencia (match_category
  // sin el filtro de confianza/confirmado que sí aplica el trigger) — así
  // el usuario ve una categoría ya seleccionada y solo tiene que confirmar
  // o cambiarla, no elegir desde cero cada vez.
  const pendientesConSugerencia = await Promise.all(
    (pendientesRaw ?? []).map(async (t) => {
      const { data: match } = await supabase
        .rpc("match_category", { p_raw_description: t.description_raw, p_entity_id: null, p_tipo_flujo: t.tipo_flujo ?? null })
        .maybeSingle<{ hacienda_category_id: number | null }>();
      return { ...t, sugeridaId: match?.hacienda_category_id ?? null, cuentaLabel: etiquetaDeTransaccion(t) };
    })
  );

  return (
    <div className="vc-shell">
      <div className="mb-4">
        <p className="text-xl font-medium">{saludoPorHora(hoy)}, {firstName} 👋</p>
        <p className="mt-0.5 text-xs capitalize text-muted">{fechaLbl} · Personal</p>
      </div>

      {/* BALANCE — real si ya conectó banco por Plaid, si no estado vacío honesto */}
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

      {/* Selector de mes — solo afecta Ingresos y Gastos, ver comentario
      junto a mesActualStr/mesSeleccionado arriba. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted">Ingresos y Gastos de:</span>
        {mesesDisponibles.map((m) => (
          <Link
            key={m}
            href={m === mesActualStr ? "/dashboard" : `/dashboard?mes=${m}`}
            className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${
              mesSeleccionado === m ? "border-teal text-teal" : "text-muted"
            }`}
            style={{ borderColor: mesSeleccionado === m ? undefined : "var(--border)" }}
          >
            {etiquetaMes(m)}
          </Link>
        ))}
      </div>

      {/* MÉTRICAS */}
      <div className="vc-mets">
        <div className="vc-met">
          <p className="vc-ml">Ingresos</p>
          <p className={`vc-mv ${bancoConectado && ingresosDelMes > 0 ? "!text-grn" : ""}`}>
            <Sensitive>{formatMoney(ingresosDelMes)}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{mesSeleccionado === mesActualStr ? "este mes" : etiquetaMes(mesSeleccionado)}</p>
        </div>
        <div className="vc-met">
          <p className="vc-ml">Gastos</p>
          <p className="vc-mv">
            <Sensitive>{formatMoney(gastosDelMes)}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{mesSeleccionado === mesActualStr ? "este mes" : etiquetaMes(mesSeleccionado)}</p>
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
          <p className={`vc-mv ${bancoConectado && deudaTotal > 0 ? "!text-red" : ""}`}>
            <Sensitive>{bancoConectado ? formatMoney(deudaTotal) : "—"}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{bancoConectado ? "tarjetas y préstamos" : "conecta tu banco"}</p>
        </div>
        <div className="vc-met">
          <p className="vc-ml">Inversiones</p>
          <p className="vc-mv">
            <Sensitive>{bancoConectado ? formatMoney(inversionTotal) : "—"}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{bancoConectado ? "cuentas de inversión" : "conecta tu banco"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* METAS */}
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

        {/* ALERTAS */}
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

        {/* PRÓXIMAS CITAS (0030) */}
        <div className="vc-card !p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Próxima cita</p>
            <Link href="/dashboard/citas/nueva" className="text-xs font-medium text-teal hover:opacity-80">
              + Nueva
            </Link>
          </div>
          <div className="p-4">
            {citasProximas.length === 0 && (
              <p className="text-xs text-muted">Sin citas pendientes.</p>
            )}
            {citasProximas.length > 0 && (
              <div>
                {citasProximas.map((c) => {
                  const color = c.dias <= 1 ? "var(--red)" : c.dias <= 3 ? "var(--amb)" : "var(--grn)";
                  const cuando = c.dias === 0 ? "Hoy" : c.dias === 1 ? "Mañana" : `En ${c.dias} días`;
                  return (
                    <Link key={c.id} href={`/dashboard/citas/${c.id}/editar`} className="vc-alert">
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
