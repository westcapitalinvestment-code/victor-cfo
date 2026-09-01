import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import GastosList from "../../gastos/gastos-list";
import CuentaDropdown from "../../gastos/cuenta-dropdown";
import CategoriaDropdown from "../../gastos/categoria-dropdown";
import ReporteContableDropdown from "../../gastos/reporte-contable-dropdown";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";
import { fechaHoyPR } from "@/lib/hora-pr";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

// Gastos de negocio (1 sept 2026) — deja de ser cascarón ahora que
// plaid_accounts.entity_id existe (migración 0040) y cada cuenta se puede
// asignar a una entidad desde /dashboard/cuentas. Es prácticamente el mismo
// componente que Gastos personal (app/dashboard/gastos/page.tsx), scoped
// por entity_id = entidadId en vez de entity_id IS NULL — reusa los mismos
// 4 subcomponentes (GastosList, CuentaDropdown, CategoriaDropdown,
// ReporteContableDropdown), que ahora aceptan basePath/entityId para
// navegar dentro de /dashboard/negocio/gastos en vez de /dashboard/gastos.

const BASE_PATH = "/dashboard/negocio/gastos";

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

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

const LIMITE_TRANSACCIONES = 300;

function idConPrefijo(origen: "plaid" | "manual", id: string) {
  return `${origen}:${id}`;
}
function parsearCuentaSeleccionada(valor: string | undefined): { origen: "plaid" | "manual"; id: string } | null {
  if (!valor) return null;
  const [origen, ...resto] = valor.split(":");
  const id = resto.join(":");
  if ((origen === "plaid" || origen === "manual") && id) return { origen, id };
  return null;
}
function parsearCuentasSeleccionadas(valor: string | undefined): { origen: "plaid" | "manual"; id: string }[] {
  if (!valor) return [];
  return valor
    .split(",")
    .map((v) => parsearCuentaSeleccionada(v))
    .filter((c): c is { origen: "plaid" | "manual"; id: string } => c !== null);
}

const SIN_CATEGORIZAR = "sin_categorizar";
function parsearCategoriaSeleccionada(valor: string | undefined): { tipo: "id"; id: number } | { tipo: "sin_categorizar" } | null {
  if (!valor) return null;
  if (valor === SIN_CATEGORIZAR) return { tipo: "sin_categorizar" };
  const id = Number(valor);
  if (Number.isFinite(id)) return { tipo: "id", id };
  return null;
}

export default async function GastosNegocioPage({
  searchParams,
}: {
  searchParams: { cuentas?: string; categoria?: string; tipo?: string; mes?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: entidades } = await supabase.from("business_entities").select("id, name").eq("owner_id", user.id).eq("active", true);
  const { entidadId, vistaGlobal } = resolverEntidadActiva(entidades ?? [], leerEntidadActivaCookie());

  if (!entidades || entidades.length === 0) {
    return (
      <div className="vc-shell">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de ver sus gastos.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  if (vistaGlobal || !entidadId) {
    return (
      <div className="vc-shell">
        <div className="vc-card text-center">
          <p className="text-sm text-muted">Elige una entidad específica en el selector de arriba para ver sus gastos.</p>
        </div>
      </div>
    );
  }

  const entidadActiva = entidades.find((e) => e.id === entidadId)!;

  // Cuentas de esta entidad (asignadas desde /dashboard/cuentas). A
  // diferencia de Personal, aquí no hay filtro de es_negocio/Core — estar
  // dentro de Negocio ya implica Pro.
  const { data: cuentasPlaid } = await supabase
    .from("plaid_accounts")
    .select("plaid_account_id, name, nickname, mask, type, subtype")
    .eq("owner_id", user.id)
    .eq("entity_id", entidadId)
    .order("name");

  const cuentasSeleccionadas = parsearCuentasSeleccionadas(searchParams.cuentas);
  const categoriaSeleccionada = parsearCategoriaSeleccionada(searchParams.categoria);
  const tipoReporte: "gasto" | "ingreso" = searchParams.tipo === "ingreso" ? "ingreso" : "gasto";

  const mesActualStr = fechaHoyPR().slice(0, 7);
  const mesSeleccionado = searchParams.mes ?? mesActualStr;
  const esTodo = mesSeleccionado === "todo";
  const inicioMesSel = esTodo ? null : `${mesSeleccionado}-01`;
  const finMesSel = esTodo ? null : primerDiaDelMesSiguiente(mesSeleccionado);
  function dentroDelRango(fecha: string): boolean {
    if (esTodo) return true;
    return fecha >= inicioMesSel! && fecha < finMesSel!;
  }

  let transaccionesQuery = supabase
    .from("transactions")
    .select("id, description_raw, amount, fecha, hacienda_category_id, plaid_account_id, manual_account_id, tipo_flujo, pending")
    .eq("owner_id", user.id)
    .eq("entity_id", entidadId)
    .order("fecha", { ascending: false })
    .limit(LIMITE_TRANSACCIONES);
  if (cuentasSeleccionadas.length > 0) {
    const plaidIds = cuentasSeleccionadas.filter((c) => c.origen === "plaid").map((c) => c.id);
    const manualIds = cuentasSeleccionadas.filter((c) => c.origen === "manual").map((c) => c.id);
    const condiciones: string[] = [];
    if (plaidIds.length > 0) condiciones.push(`plaid_account_id.in.(${plaidIds.join(",")})`);
    if (manualIds.length > 0) condiciones.push(`manual_account_id.in.(${manualIds.join(",")})`);
    if (condiciones.length > 0) transaccionesQuery = transaccionesQuery.or(condiciones.join(","));
  }

  const [{ data: transacciones, error }, { data: categorias }] = await Promise.all([
    transaccionesQuery,
    supabase.from("hacienda_categories").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  const idsTransacciones = (transacciones ?? []).map((t) => t.id);
  const { data: cambiosRecientes } =
    idsTransacciones.length > 0
      ? await supabase
          .from("transaction_sync_log")
          .select("transaction_id, descripcion_anterior, descripcion_nueva, monto_anterior, monto_nuevo, pending_anterior, pending_nuevo, creado_en")
          .eq("owner_id", user.id)
          .in("transaction_id", idsTransacciones)
          .order("creado_en", { ascending: false })
      : { data: [] as { transaction_id: string; descripcion_anterior: string | null; descripcion_nueva: string | null; monto_anterior: number | null; monto_nuevo: number | null; pending_anterior: boolean | null; pending_nuevo: boolean | null; creado_en: string }[] };

  const cambioPorTransaccion: Record<string, { descripcionAnterior: string | null; montoAnterior: number | null; fecha: string }> = {};
  for (const c of cambiosRecientes ?? []) {
    if (cambioPorTransaccion[c.transaction_id]) continue;
    cambioPorTransaccion[c.transaction_id] = {
      descripcionAnterior: c.descripcion_anterior,
      montoAnterior: c.monto_anterior,
      fecha: c.creado_en,
    };
  }

  const mesesDisponibles = Array.from(new Set([mesActualStr, ...(transacciones ?? []).map((t) => t.fecha.slice(0, 7))]))
    .sort()
    .slice(-12);

  const etiquetaCuenta = (c: { name: string | null; nickname?: string | null; mask: string | null }) =>
    `${c.nickname || c.name || "Cuenta sin nombre"}${c.mask ? ` ···${c.mask}` : ""}`;
  const nombrePorCuenta = new Map<string, string>();
  for (const c of cuentasPlaid ?? []) nombrePorCuenta.set(idConPrefijo("plaid", c.plaid_account_id), etiquetaCuenta(c));
  const totalCuentas = cuentasPlaid?.length ?? 0;

  const hoy = new Date();
  const nombrePorCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  const gastoPorCategoria = new Map<string, { nombre: string; monto: number }>();
  let gastosBaseParaPct = 0;
  for (const t of transacciones ?? []) {
    if (t.tipo_flujo !== tipoReporte) continue;
    const sinCategoria = !t.hacienda_category_id;
    const dentroDelMes = dentroDelRango(t.fecha);
    if (!sinCategoria && !dentroDelMes) continue;
    const montoAbs = Math.abs(Number(t.amount));
    if (dentroDelMes) gastosBaseParaPct += montoAbs;
    const catKey = sinCategoria ? SIN_CATEGORIZAR : String(t.hacienda_category_id);
    const nombre = sinCategoria ? "Sin categorizar" : nombrePorCategoria.get(t.hacienda_category_id!) ?? "Sin categorizar";
    const actual = gastoPorCategoria.get(catKey) ?? { nombre, monto: 0 };
    actual.monto += montoAbs;
    gastoPorCategoria.set(catKey, actual);
  }
  const reporteCategoria = Array.from(gastoPorCategoria.entries())
    .map(([catKey, v]) => ({ catKey, nombre: v.nombre, monto: v.monto }))
    .sort((a, b) => b.monto - a.monto);

  const NOMBRE_CATEGORIA_INVERSION = "Ahorro e inversión";
  let totalIngresosMes = 0;
  let totalGastosRealesMes = 0;
  let totalAhorroInversionMes = 0;
  for (const t of transacciones ?? []) {
    if (!dentroDelRango(t.fecha)) continue;
    const montoAbs = Math.abs(Number(t.amount));
    if (t.tipo_flujo === "ingreso") {
      totalIngresosMes += montoAbs;
    } else if (t.tipo_flujo === "gasto") {
      const nombreCat = t.hacienda_category_id ? nombrePorCategoria.get(t.hacienda_category_id) : null;
      if (nombreCat === NOMBRE_CATEGORIA_INVERSION) totalAhorroInversionMes += montoAbs;
      else totalGastosRealesMes += montoAbs;
    }
  }

  const transaccionesMostradas = categoriaSeleccionada
    ? (transacciones ?? []).filter((t) => {
        if (t.tipo_flujo !== tipoReporte) return false;
        if (categoriaSeleccionada.tipo === "sin_categorizar") return !t.hacienda_category_id;
        if (!dentroDelRango(t.fecha)) return false;
        return t.hacienda_category_id === categoriaSeleccionada.id;
      })
    : (transacciones ?? []).filter((t) => t.tipo_flujo === tipoReporte && dentroDelRango(t.fecha));

  const nombreCategoriaSeleccionada = categoriaSeleccionada
    ? reporteCategoria.find((r) =>
        categoriaSeleccionada.tipo === "sin_categorizar" ? r.catKey === SIN_CATEGORIZAR : r.catKey === String(categoriaSeleccionada.id)
      )?.nombre ?? "Sin categorizar"
    : null;

  function hrefFiltros(opts: { mes?: string; tipo?: "gasto" | "ingreso"; categoria?: string | null } = {}) {
    const params = new URLSearchParams();
    if (searchParams.cuentas) params.set("cuentas", searchParams.cuentas);

    const tipoNuevo = opts.tipo ?? tipoReporte;
    if (tipoNuevo === "ingreso") params.set("tipo", "ingreso");

    const mesNuevo = opts.mes ?? mesSeleccionado;
    if (mesNuevo !== mesActualStr) params.set("mes", mesNuevo);

    const cambiaTipo = opts.tipo !== undefined && opts.tipo !== tipoReporte;
    const categoriaNueva = cambiaTipo ? null : opts.categoria !== undefined ? opts.categoria : (searchParams.categoria ?? null);
    if (categoriaNueva) params.set("categoria", categoriaNueva);

    const qs = params.toString();
    return `${BASE_PATH}${qs ? `?${qs}` : ""}`;
  }

  const opcionesCategoria = [
    { catKey: null, nombre: "Todas", href: hrefFiltros({ categoria: null }), activa: !categoriaSeleccionada },
    {
      catKey: SIN_CATEGORIZAR,
      nombre: "Sin categorizar",
      href: hrefFiltros({ categoria: SIN_CATEGORIZAR }),
      activa: categoriaSeleccionada?.tipo === "sin_categorizar",
    },
    ...(categorias ?? []).map((c) => ({
      catKey: String(c.id),
      nombre: c.nombre,
      href: hrefFiltros({ categoria: String(c.id) }),
      activa: categoriaSeleccionada?.tipo === "id" && categoriaSeleccionada.id === c.id,
    })),
  ];

  const anioActual = hoy.getFullYear();
  const rangosReporte: { label: string; desde?: string; hasta?: string }[] = [
    { label: "Este mes", desde: fmt(new Date(anioActual, hoy.getMonth(), 1)), hasta: fmt(hoy) },
    { label: "Mes anterior", desde: fmt(new Date(anioActual, hoy.getMonth() - 1, 1)), hasta: fmt(new Date(anioActual, hoy.getMonth(), 0)) },
    { label: "Trimestre", desde: fmt(new Date(anioActual, Math.floor(hoy.getMonth() / 3) * 3, 1)), hasta: fmt(hoy) },
    { label: "YTD", desde: fmt(new Date(anioActual, 0, 1)), hasta: fmt(hoy) },
    { label: `Año ${anioActual - 1} (planillas)`, desde: fmt(new Date(anioActual - 1, 0, 1)), hasta: fmt(new Date(anioActual - 1, 11, 31)) },
    { label: "Todo", desde: undefined, hasta: undefined },
  ];

  return (
    <div className="vc-shell">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Gastos</h1>
          <p className="text-xs text-muted">{entidadActiva.name}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ReporteContableDropdown rangos={rangosReporte} entityId={entidadId} />
        {totalCuentas > 1 && (
          <CuentaDropdown
            opciones={Array.from(nombrePorCuenta.entries()).map(([clave, nombre]) => ({ clave, nombre }))}
            seleccionadas={cuentasSeleccionadas.map((c) => idConPrefijo(c.origen, c.id))}
            basePath={BASE_PATH}
          />
        )}
        <CategoriaDropdown opciones={opcionesCategoria} basePath={BASE_PATH} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted">Ver:</span>
        <Link
          href={hrefFiltros({ tipo: "gasto" })}
          className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${
            tipoReporte === "gasto" ? "border-red text-red" : "text-muted"
          }`}
          style={{ borderColor: tipoReporte === "gasto" ? undefined : "var(--border)" }}
        >
          Gastos
        </Link>
        <Link
          href={hrefFiltros({ tipo: "ingreso" })}
          className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${
            tipoReporte === "ingreso" ? "border-grn text-grn" : "text-muted"
          }`}
          style={{ borderColor: tipoReporte === "ingreso" ? undefined : "var(--border)" }}
        >
          Ingresos
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted">Mes:</span>
        {mesesDisponibles.map((m) => (
          <Link
            key={m}
            href={hrefFiltros({ mes: m })}
            className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${
              !esTodo && mesSeleccionado === m ? "border-teal text-teal" : "text-muted"
            }`}
            style={{ borderColor: !esTodo && mesSeleccionado === m ? undefined : "var(--border)" }}
          >
            {etiquetaMes(m)}
          </Link>
        ))}
        <Link
          href={hrefFiltros({ mes: "todo" })}
          className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${esTodo ? "border-teal text-teal" : "text-muted"}`}
          style={{ borderColor: esTodo ? undefined : "var(--border)" }}
        >
          Todo
        </Link>
      </div>

      <div className="vc-card mb-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-muted">Ingresos</p>
          <p className="text-sm font-medium text-grn">
            <Sensitive>{formatMoney(totalIngresosMes)}</Sensitive>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Gastos</p>
          <p className="text-sm font-medium text-red">
            <Sensitive>{formatMoney(totalGastosRealesMes)}</Sensitive>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Ahorro e inversión</p>
          <p className="text-sm font-medium text-teal">
            <Sensitive>{formatMoney(totalAhorroInversionMes)}</Sensitive>
          </p>
        </div>
      </div>

      {reporteCategoria.length > 0 && (
        <div className="vc-card mb-3">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
            Reporte {tipoReporte === "ingreso" ? "de ingresos" : "de gastos"} {esTodo ? "de todo el historial" : `de ${etiquetaMes(mesSeleccionado)}`} — toca
            una para ver sus transacciones
          </p>
          <div className="flex flex-col gap-2">
            {reporteCategoria.map((r) => {
              const pctReal = gastosBaseParaPct > 0 ? Math.round((r.monto / gastosBaseParaPct) * 100) : 0;
              const pct = Math.min(pctReal, 100);
              const activa = categoriaSeleccionada
                ? categoriaSeleccionada.tipo === "sin_categorizar"
                  ? r.catKey === SIN_CATEGORIZAR
                  : r.catKey === String(categoriaSeleccionada.id)
                : false;
              return (
                <Link
                  key={r.catKey}
                  href={hrefFiltros({ categoria: activa ? null : r.catKey })}
                  className={`-mx-2 rounded-lg px-2 py-1 text-left hover:opacity-80 ${activa ? "bg-teal/[.08]" : ""}`}
                >
                  <div className="flex justify-between text-sm">
                    <span className={r.nombre === "Sin categorizar" ? "text-muted" : activa ? "font-medium text-teal" : ""}>{r.nombre}</span>
                    <span className="font-medium">
                      <Sensitive>{formatMoney(r.monto)}</Sensitive> <span className="text-xs text-muted">({pctReal}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-border">
                    <div className={`h-1.5 rounded-full ${activa ? "bg-teal" : "bg-teal/60"}`} style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {categoriaSeleccionada && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-teal bg-teal/[.06] px-3 py-2 text-xs">
          <span>
            Mostrando: <span className="font-medium">{nombreCategoriaSeleccionada}</span> ·{" "}
            {categoriaSeleccionada?.tipo === "sin_categorizar" || esTodo ? "todo el historial" : etiquetaMes(mesSeleccionado)} ·{" "}
            {transaccionesMostradas.length} transacción(es)
          </span>
          <Link href={hrefFiltros({ categoria: null })} className="font-medium text-teal hover:opacity-80">
            ✕ Quitar filtro
          </Link>
        </div>
      )}

      {!categoriaSeleccionada && (
        <div className="mb-3 flex items-center rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)" }}>
          <span className="text-muted">
            Mostrando: <span className="font-medium text-text">{esTodo ? "todo el historial" : etiquetaMes(mesSeleccionado)}</span> ·{" "}
            {transaccionesMostradas.length} transacción(es)
          </span>
        </div>
      )}

      <div className="vc-card">
        {error && <p className="text-xs text-amb">No se pudo leer transactions ({error.message}).</p>}

        {!error && transaccionesMostradas.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted">
              {categoriaSeleccionada
                ? `No hay transacciones en esta categoría ${esTodo ? "en el historial" : `en ${etiquetaMes(mesSeleccionado)}`}.`
                : "Todavía no hay transacciones de esta entidad."}
            </p>
            {!categoriaSeleccionada && totalCuentas === 0 && (
              <p className="mt-1 text-xs text-muted">
                Asigna una cuenta a {entidadActiva.name} desde{" "}
                <Link href="/dashboard/cuentas" className="text-teal">
                  Cuentas
                </Link>
                .
              </p>
            )}
          </div>
        )}

        {transaccionesMostradas.length > 0 && (
          <GastosList
            key={`${searchParams.cuentas ?? "todas"}-${searchParams.categoria ?? "todas"}-${tipoReporte}-${mesSeleccionado}`}
            transaccionesIniciales={transaccionesMostradas}
            categorias={categorias ?? []}
            nombrePorCuenta={Object.fromEntries(nombrePorCuenta)}
            cambioPorTransaccion={cambioPorTransaccion}
          />
        )}
        {!categoriaSeleccionada && transacciones && transacciones.length === LIMITE_TRANSACCIONES && (
          <p className="mt-3 text-center text-xs text-muted">
            Mostrando las {LIMITE_TRANSACCIONES} más recientes
            {cuentasSeleccionadas.length === 1 ? " de esta cuenta" : cuentasSeleccionadas.length > 1 ? " de estas cuentas" : ""}. Filtra por
            cuenta arriba o descarga el reporte completo para tu contador si necesitas todo el historial.
          </p>
        )}
      </div>
    </div>
  );
}
