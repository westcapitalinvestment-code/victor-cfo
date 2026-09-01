import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";
import RangoDropdown from "./rango-dropdown";

// Tab "Resumen" — disponible en Core (no solo en Pro). Consolida Personal +
// TODAS las entidades de negocio (si es Pro y tiene alguna) en un solo
// total, calcado del mockup "VICTOR — Dashboard Pro.html" (#s-resumen):
// tarjetas Personal/Negocio lado a lado, Flujo neto total, Proyección
// anual consolidada, Acciones recomendadas. Si no es Pro o no tiene
// entidades, se ve igual que antes (solo Personal) — nada inventado.
//
// A propósito NO junta las cuentas de negocio bajo una sola entidad: si el
// usuario tiene varias entidades de Pro, "Negocio" aquí es la SUMA de
// todas — el desglose por entidad individual vive en el Inicio de cada
// una (/dashboard/negocio).

type Rango = "mes_actual" | "mes_anterior" | "trimestre" | "ytd" | "custom";

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function calcularRango(sp: { rango?: string; desde?: string; hasta?: string }) {
  const hoy = new Date();
  const rango = (sp.rango as Rango) || "mes_actual";

  if (rango === "mes_anterior") {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    return { rango, inicio: fmt(inicio), fin: fmt(fin), etiqueta: inicio.toLocaleDateString("es-PR", { month: "long", year: "numeric" }) };
  }
  if (rango === "trimestre") {
    const qStartMonth = Math.floor(hoy.getMonth() / 3) * 3;
    const inicio = new Date(hoy.getFullYear(), qStartMonth, 1);
    return { rango, inicio: fmt(inicio), fin: fmt(hoy), etiqueta: `Q${Math.floor(qStartMonth / 3) + 1} ${hoy.getFullYear()}` };
  }
  if (rango === "ytd") {
    const inicio = new Date(hoy.getFullYear(), 0, 1);
    return { rango, inicio: fmt(inicio), fin: fmt(hoy), etiqueta: `Año ${hoy.getFullYear()} (a la fecha)` };
  }
  if (rango === "custom" && sp.desde && sp.hasta) {
    return { rango, inicio: sp.desde, fin: sp.hasta, etiqueta: `${sp.desde} a ${sp.hasta}` };
  }
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return { rango: "mes_actual" as Rango, inicio: fmt(inicio), fin: fmt(hoy), etiqueta: hoy.toLocaleDateString("es-PR", { month: "long", year: "numeric" }) };
}

// Mes calendario anterior al que empieza `inicioISO` — usado para la
// comparación "vs mes anterior" de Flujo neto total. Solo tiene sentido
// cuando el rango seleccionado es un mes calendario completo (mes_actual/
// mes_anterior); para trimestre/YTD/rango custom no se muestra el delta,
// para no comparar cosas de tamaño distinto (ej. YTD vs "el mes antes de
// enero").
function mesAnteriorA(inicioISO: string) {
  const [y, m] = inicioISO.split("-").map(Number);
  const inicio = new Date(y, m - 2, 1);
  const fin = new Date(y, m - 1, 0);
  return { inicio: fmt(inicio), fin: fmt(fin) };
}

const PILLS: { rango: Rango; label: string }[] = [
  { rango: "mes_actual", label: "Este mes" },
  { rango: "mes_anterior", label: "Mes anterior" },
  { rango: "trimestre", label: "Trimestre" },
  { rango: "ytd", label: "YTD" },
];

export default async function ResumenPage({
  searchParams,
}: {
  searchParams: { rango?: string; desde?: string; hasta?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";

  const { rango, inicio, fin, etiqueta } = calcularRango(searchParams);

  const { data: entidades } = esPro
    ? await supabase.from("business_entities").select("id, name").eq("owner_id", user.id).eq("active", true)
    : { data: [] as { id: string; name: string }[] };
  const idsEntidades = (entidades ?? []).map((e) => e.id);
  const hayNegocio = idsEntidades.length > 0;

  const { data: transacciones } = await supabase
    .from("transactions")
    .select("amount, hacienda_category_id, tipo_flujo, entity_id")
    .eq("owner_id", user.id)
    .eq("es_duplicada", false)
    .gte("fecha", inicio)
    .lte("fecha", fin);

  const transPersonal = (transacciones ?? []).filter((t) => !t.entity_id);
  const transNegocio = (transacciones ?? []).filter((t) => t.entity_id && idsEntidades.includes(t.entity_id));

  function sumar(rows: typeof transPersonal, tipo: "gasto" | "ingreso") {
    return rows.reduce((sum, t) => sum + (t.tipo_flujo === tipo ? Math.abs(Number(t.amount)) : 0), 0);
  }

  const gastosPersonal = sumar(transPersonal, "gasto");
  const ingresosPersonal = sumar(transPersonal, "ingreso");
  const gastosNegocio = sumar(transNegocio, "gasto");
  const ingresosNegocio = sumar(transNegocio, "ingreso");

  const gastosDelPeriodo = gastosPersonal + gastosNegocio;
  const ingresosDelPeriodo = ingresosPersonal + ingresosNegocio;
  const flujoNetoTotal = ingresosDelPeriodo - gastosDelPeriodo;
  const gananciaNegocio = ingresosNegocio - gastosNegocio;
  const tasaAhorro = ingresosDelPeriodo > 0 ? Math.round((flujoNetoTotal / ingresosDelPeriodo) * 100) : 0;

  // Reporte contable básico (solo Personal, igual que antes — el desglose
  // de negocio por categoría vive dentro de cada entidad, no mezclado aquí).
  const { data: categoriasDisponibles } = await supabase
    .from("hacienda_categories")
    .select("id, nombre")
    .eq("activo", true);
  const nombrePorCategoria = new Map((categoriasDisponibles ?? []).map((c) => [c.id, c.nombre]));

  const gastoPorCategoria = new Map<string, number>();
  for (const t of transPersonal) {
    if (t.tipo_flujo !== "gasto") continue;
    const nombre = t.hacienda_category_id ? nombrePorCategoria.get(t.hacienda_category_id) ?? "Sin categorizar" : "Sin categorizar";
    gastoPorCategoria.set(nombre, (gastoPorCategoria.get(nombre) ?? 0) + Math.abs(Number(t.amount)));
  }
  const reporteCategoria = Array.from(gastoPorCategoria.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const { data: goals } = await supabase
    .from("goals")
    .select("name, target_amount, current_amount")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .eq("status", "activa");

  const totalAhorrado = (goals ?? []).reduce((sum, g) => sum + Number(g.current_amount), 0);
  const totalObjetivo = (goals ?? []).reduce((sum, g) => sum + Number(g.target_amount), 0);

  const { data: docs } = await supabase
    .from("documents")
    .select("id, fecha_vencimiento")
    .eq("owner_id", user.id)
    .eq("estado", "activo")
    .not("fecha_vencimiento", "is", null);

  const hoy = new Date();
  const en30dias = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);
  const alertasProximas = (docs ?? []).filter((d) => new Date(d.fecha_vencimiento) <= en30dias).length;

  // Balance (cuentas líquidas, Plaid) — Personal = entity_id null,
  // Negocio = suma de todas las entidades. Mismo criterio "depository" que
  // usan Inicio Personal y Inicio de negocio.
  const { data: cuentas } = await supabase
    .from("plaid_accounts")
    .select("current_balance, type, entity_id")
    .eq("owner_id", user.id);
  const balancePersonal = (cuentas ?? [])
    .filter((c) => !c.entity_id && c.type === "depository")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
  const balanceNegocio = (cuentas ?? [])
    .filter((c) => c.entity_id && idsEntidades.includes(c.entity_id) && c.type === "depository")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  // "vs mes anterior" — solo para mes_actual/mes_anterior (mismo tamaño de
  // período, comparación real). Para trimestre/YTD/rango custom se omite.
  let deltaFlujoNeto: number | null = null;
  if (rango === "mes_actual" || rango === "mes_anterior") {
    const anterior = mesAnteriorA(inicio);
    const { data: transAnterior } = await supabase
      .from("transactions")
      .select("amount, tipo_flujo, entity_id")
      .eq("owner_id", user.id)
      .eq("es_duplicada", false)
      .gte("fecha", anterior.inicio)
      .lte("fecha", anterior.fin);
    const filas = transAnterior ?? [];
    const ing = filas.reduce((sum, t) => sum + (t.tipo_flujo === "ingreso" ? Math.abs(Number(t.amount)) : 0), 0);
    const gas = filas.reduce((sum, t) => sum + (t.tipo_flujo === "gasto" ? Math.abs(Number(t.amount)) : 0), 0);
    deltaFlujoNeto = flujoNetoTotal - (ing - gas);
  }

  // Proyección anual — solo tiene sentido para un período que todavía está
  // corriendo (mes_actual/trimestre/ytd, no un mes ya cerrado ni un rango
  // custom): ritmo diario real de LO QUE VA DE ESE PERÍODO, extendido a
  // 365 días. Nada inventado — si no hay datos, ritmo diario es $0.
  let diasTranscurridos = 0;
  if (rango === "mes_actual" || rango === "trimestre" || rango === "ytd") {
    const inicioDate = new Date(`${inicio}T00:00:00`);
    diasTranscurridos = Math.max(1, Math.round((hoy.getTime() - inicioDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  }
  const mostrarProyeccion = diasTranscurridos > 0;
  const ingresoProyectado = mostrarProyeccion ? (ingresosDelPeriodo / diasTranscurridos) * 365 : 0;
  const gastoProyectado = mostrarProyeccion ? (gastosDelPeriodo / diasTranscurridos) * 365 : 0;
  const flujoProyectado = ingresoProyectado - gastoProyectado;

  // Reserva de impuestos sugerida — 25% de la ganancia de negocio del
  // período (heurística de reserva para estimadas trimestrales, no un
  // cálculo oficial de Hacienda). Se muestra con su fórmula visible y un
  // enlace a invitar al contable, para que quede claro que es un estimado,
  // no asesoría fiscal.
  const RESERVA_PCT = 0.25;
  const reservaImpuestos = hayNegocio && gananciaNegocio > 0 ? gananciaNegocio * RESERVA_PCT : 0;

  return (
    <div className="vc-shell">
      <div className="mb-4">
        <h1 className="text-xl font-medium">Resumen</h1>
        <p className="mt-0.5 text-xs capitalize text-muted">{hayNegocio ? "Negocio + personal" : "Personal"} · {etiqueta}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PILLS.map((p) => (
          <Link
            key={p.rango}
            href={`/dashboard/resumen?rango=${p.rango}`}
            className="rounded-pill border px-3 py-1.5 text-xs font-medium"
            style={
              rango === p.rango
                ? { background: "#1D9E75", borderColor: "#1D9E75", color: "#fff" }
                : { borderColor: "var(--border)", color: "var(--muted)" }
            }
          >
            {p.label}
          </Link>
        ))}
        <RangoDropdown activo={rango === "custom"} inicio={inicio} fin={fin} />
      </div>

      {/* PERSONAL + NEGOCIO lado a lado — calcado del mockup. Si no hay
          negocio (Core, o Pro sin entidades), Personal ocupa todo el ancho. */}
      <div className={`mb-3 grid gap-3 ${hayNegocio ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        <div className="rounded-2xl p-4 text-white" style={{ background: "#1D9E75" }}>
          <p className="text-[11px] uppercase tracking-wide text-white/75">Personal</p>
          <p className="mt-1 text-2xl font-medium">
            <Sensitive>{formatMoney(balancePersonal)}</Sensitive>
          </p>
          <div className="mt-3 flex justify-between border-t border-white/20 pt-2 text-xs">
            <span className="text-white/75">Ingresos</span>
            <span className="font-medium">
              <Sensitive>{formatMoney(ingresosPersonal)}</Sensitive>
            </span>
          </div>
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-white/75">Gastos</span>
            <span className="font-medium">
              <Sensitive>{formatMoney(gastosPersonal)}</Sensitive>
            </span>
          </div>
        </div>

        {hayNegocio && (
          <div className="rounded-2xl p-4 text-white" style={{ background: "#16324F" }}>
            <p className="text-[11px] uppercase tracking-wide text-white/75">Negocio</p>
            <p className="mt-0.5 text-[11px] text-white/60">
              {(entidades ?? []).length === 1 ? entidades![0].name : `${(entidades ?? []).length} entidades`}
            </p>
            <p className="mt-1 text-2xl font-medium">
              <Sensitive>{formatMoney(balanceNegocio)}</Sensitive>
            </p>
            <div className="mt-3 flex justify-between border-t border-white/20 pt-2 text-xs">
              <span className="text-white/75">Ingresos</span>
              <span className="font-medium">
                <Sensitive>{formatMoney(ingresosNegocio)}</Sensitive>
              </span>
            </div>
            <div className="mt-1 flex justify-between text-xs">
              <span className="text-white/75">Gastos</span>
              <span className="font-medium">
                <Sensitive>{formatMoney(gastosNegocio)}</Sensitive>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* FLUJO NETO TOTAL + 3 mini-stats */}
      <div className="vc-card mb-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Flujo neto total · {etiqueta}</p>
            <p className={`mt-1 text-2xl font-medium ${flujoNetoTotal >= 0 ? "text-grn" : "text-red"}`}>
              <Sensitive>{formatMoney(flujoNetoTotal)}</Sensitive>
            </p>
          </div>
          {deltaFlujoNeto !== null && (
            <p className={`mt-1 text-xs font-medium ${deltaFlujoNeto >= 0 ? "text-grn" : "text-red"}`}>
              {deltaFlujoNeto >= 0 ? "↑" : "↓"} <Sensitive>{formatMoney(Math.abs(deltaFlujoNeto))}</Sensitive>
              <span className="ml-1 text-muted">vs mes anterior</span>
            </p>
          )}
        </div>

        {hayNegocio && (
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Ganancia negocio</p>
              <p className="mt-1 text-sm font-medium">
                <Sensitive>{formatMoney(gananciaNegocio)}</Sensitive>
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Gastos personales</p>
              <p className="mt-1 text-sm font-medium text-red">
                <Sensitive>{formatMoney(gastosPersonal)}</Sensitive>
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Tasa de ahorro</p>
              <p className="mt-1 text-sm font-medium">{tasaAhorro}%</p>
            </div>
          </div>
        )}
      </div>

      {/* PROYECCIÓN ANUAL CONSOLIDADA — solo si el período todavía está
          corriendo (mes_actual/trimestre/ytd). Ritmo real del período,
          extendido a 365 días — no un número inventado. */}
      {mostrarProyeccion && (
        <div className="vc-card mb-3">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Proyección anual consolidada</p>
          <div className="rw flex justify-between border-b border-border py-2 text-sm">
            <span className="text-muted">Ingreso proyectado total</span>
            <span className="font-medium text-grn">
              <Sensitive>{formatMoney(ingresoProyectado)}</Sensitive>
            </span>
          </div>
          <div className="rw flex justify-between border-b border-border py-2 text-sm">
            <span className="text-muted">Gastos proyectados</span>
            <span className="font-medium text-red">
              <Sensitive>{formatMoney(gastoProyectado)}</Sensitive>
            </span>
          </div>
          <div className="rw flex justify-between border-b border-border py-2 text-sm">
            <span className="text-muted">Flujo neto proyectado</span>
            <span className="font-medium">
              <Sensitive>{formatMoney(flujoProyectado)}</Sensitive>
            </span>
          </div>
          <div className="rw flex justify-between py-2 text-sm">
            <span className="text-muted">Tasa de ahorro actual</span>
            <span className="font-medium">
              {tasaAhorro}% {tasaAhorro >= 20 && <span className="text-grn">— saludable</span>}
            </span>
          </div>
          <p className="mt-2 text-[10px] text-muted">
            Calculado con tu ritmo real de {etiqueta} ({diasTranscurridos} día{diasTranscurridos === 1 ? "" : "s"}), extendido a 365 días.
          </p>
        </div>
      )}

      {/* ACCIONES RECOMENDADAS — hoy solo la reserva de impuestos (fórmula
          simple y visible). La sugerencia de aportación IRA/Keogh queda
          pendiente a propósito: requiere codificar límites legales de
          Hacienda (IRA 2026 = $7,500 por Ley 179-2025, Keogh es otro límite
          aparte) que hay que mantener actualizados año a año — mejor
          construirlo aparte, no de pasada. */}
      {reservaImpuestos > 0 && (
        <div className="vc-card mb-3">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Acciones recomendadas</p>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium">Reserva de impuestos</p>
              <p className="mt-0.5 text-xs text-muted">Estimado: {Math.round(RESERVA_PCT * 100)}% de la ganancia de negocio de {etiqueta}</p>
            </div>
            <p className="text-sm font-medium" style={{ color: "#B7860F" }}>
              <Sensitive>{formatMoney(reservaImpuestos)}</Sensitive>
            </p>
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Esto es un estimado, no asesoría fiscal — confírmalo con tu contador.{" "}
            <Link href="/dashboard/invitar-contable" className="text-teal">
              Invítalo gratis →
            </Link>
          </p>
        </div>
      )}

      <div className="vc-card mb-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Gastos personales por categoría</p>
        {reporteCategoria.length === 0 ? (
          <p className="text-xs text-muted">Sin gastos categorizados en este período todavía.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {reporteCategoria.map(([nombre, monto]) => {
              const pct = gastosPersonal > 0 ? Math.round((monto / gastosPersonal) * 100) : 0;
              return (
                <div key={nombre}>
                  <div className="flex justify-between text-sm">
                    <span className={nombre === "Sin categorizar" ? "text-muted" : ""}>{nombre}</span>
                    <span className="font-medium">
                      <Sensitive>{formatMoney(monto)}</Sensitive> <span className="text-xs text-muted">({pct}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-border">
                    <div className="h-1.5 rounded-full bg-teal" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {reporteCategoria.some(([nombre]) => nombre === "Sin categorizar") && (
          <p className="mt-3 text-xs text-muted">
            Corrige las que digan "Sin categorizar" desde <a href="/dashboard/gastos" className="text-teal">Gastos</a> o
            dile a VICTOR a qué categoría pertenecen — mientras más corrijas, más precisas salen las próximas.
          </p>
        )}
      </div>

      <div className="vc-card mb-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Metas (personal)</p>
        {(!goals || goals.length === 0) ? (
          <p className="text-xs text-muted">Sin metas activas todavía.</p>
        ) : (
          <>
            <div className="rw flex justify-between border-b border-border py-2 text-sm">
              <span className="text-muted">Ahorrado</span>
              <span className="font-medium text-grn">
                <Sensitive>{formatMoney(totalAhorrado)}</Sensitive>
              </span>
            </div>
            <div className="rw flex justify-between py-2 text-sm">
              <span className="text-muted">Objetivo total</span>
              <span className="font-medium">
                <Sensitive>{formatMoney(totalObjetivo)}</Sensitive>
              </span>
            </div>
          </>
        )}
      </div>

      <div className="vc-card">
        <div className="rw flex justify-between py-1 text-sm">
          <span className="text-muted">Alertas por vencer (30 días, personal)</span>
          <span className="font-medium">{alertasProximas}</span>
        </div>
        {!hayNegocio && (
          <p className="mt-2 text-xs text-muted">
            {esPro
              ? "Crea tu primera entidad de negocio para que este resumen consolide Negocio + Personal."
              : "Cuando actives VICTOR Pro y crees una entidad de negocio, este resumen va a consolidar Negocio + Personal en un solo total."}
          </p>
        )}
      </div>
    </div>
  );
}
