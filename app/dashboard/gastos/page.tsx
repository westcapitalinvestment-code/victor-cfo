import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import GastosList from "./gastos-list";
import CuentaDropdown from "./cuenta-dropdown";
import CategoriaDropdown from "./categoria-dropdown";
import ReporteContableDropdown from "./reporte-contable-dropdown";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";
import { fechaHoyPR } from "@/lib/hora-pr";

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Primer día del mes SIGUIENTE a "YYYY-MM" — límite superior (exclusivo)
// para filtrar un mes específico del historial (no solo "desde tal fecha
// en adelante", que es lo único que hacía falta cuando el único mes
// posible era el actual). new Date() usa meses 0-based (0=enero), pero
// "mes" aquí viene 1-based del string — pasarlo TAL CUAL (sin -1) ya cae
// en el mes siguiente, es la forma más simple de "sumar un mes" sin
// desbordar diciembre a mano.
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

// Antes esto era .limit(50) sin filtro de cuenta — con un solo banco que
// trae 200+ transacciones en pocas semanas (ej. BPPR), esas 50 más
// recientes por fecha eran casi todas del mismo banco y las de otras
// tarjetas (Citibank, PenFed...) quedaban fuera de la vista aunque SÍ
// estaban guardadas en la base de datos. Subimos el límite bastante y
// además dejamos filtrar por cuenta específica (ver cuenta más abajo) —
// las dos cosas juntas resuelven el problema real: "no veo las
// transacciones de mi otra tarjeta".
const LIMITE_TRANSACCIONES = 300;

// El filtro de cuenta (?cuenta=) tiene que distinguir entre una cuenta de
// Plaid y una manual, porque comparten el mismo "espacio" de la pantalla
// pero son columnas distintas en transactions (plaid_account_id vs
// manual_account_id, ninguna es subconjunto de la otra). Usamos un prefijo
// simple en la URL: "plaid:<id>" o "manual:<id>".
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

// ?cuentas= ahora es multi-select (checkboxes en CuentaDropdown), así que
// viene como una lista separada por comas de los mismos tokens
// "plaid:<id>" | "manual:<id>" de arriba — se reutiliza el parser de uno
// solo por cada token. Vacío o ausente = todas las cuentas (sin filtro),
// igual que antes con el caso null de cuentaSeleccionada.
function parsearCuentasSeleccionadas(valor: string | undefined): { origen: "plaid" | "manual"; id: string }[] {
  if (!valor) return [];
  return valor
    .split(",")
    .map((v) => parsearCuentaSeleccionada(v))
    .filter((c): c is { origen: "plaid" | "manual"; id: string } => c !== null);
}

// Lista de transacciones personales. Vacía hasta que Plaid esté conectado
// (Cuentas) — es honesto mostrarlo así en vez de simular datos. La
// categoría real vive en hacienda_category_id (la llena el motor de
// categorización de 0001_schema_completo.sql + la siembra de 0011) — la
// columna "category" de texto nunca se usa, por eso antes siempre salía
// "sin categorizar". Click en la fecha/categoría para corregirla a mano.
// Igual que con la cuenta: el id de categoría en la URL puede ser el id
// numérico real de hacienda_categories, o el texto especial
// "sin_categorizar" para las transacciones sin hacienda_category_id (no
// hay ningún id de verdad que represente "sin categoría").
const SIN_CATEGORIZAR = "sin_categorizar";
function parsearCategoriaSeleccionada(valor: string | undefined): { tipo: "id"; id: number } | { tipo: "sin_categorizar" } | null {
  if (!valor) return null;
  if (valor === SIN_CATEGORIZAR) return { tipo: "sin_categorizar" };
  const id = Number(valor);
  if (Number.isFinite(id)) return { tipo: "id", id };
  return null;
}

export default async function GastosPage({
  searchParams,
}: {
  searchParams: { cuentas?: string; categoria?: string; tipo?: string; mes?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("plan")
    .eq("id", user.id)
    .single();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";

  // Cuentas/tarjetas conectadas — para el filtro de arriba y para poder
  // mostrar de qué banco/tarjeta vino cada transacción en la lista. Mismo
  // filtro de negocio que el resto de la app (si es Core, no se cuentan
  // las que parecen de negocio). Se combinan Plaid + manuales (ej. Apple
  // Card) en una sola lista de pills.
  let cuentasQuery = supabase
    .from("plaid_accounts")
    .select("plaid_account_id, name, nickname, mask, type, subtype")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .order("name");
  if (!esPro) cuentasQuery = cuentasQuery.eq("es_negocio", false);

  let manualesQuery = supabase
    .from("manual_accounts")
    .select("id, name, mask, type, subtype")
    .eq("owner_id", user.id)
    .order("name");
  if (!esPro) manualesQuery = manualesQuery.eq("es_negocio", false);

  // Conteo de "posibles duplicados" (manual↔Plaid, ver lib/duplicados.ts)
  // para el link de arriba — solo se pinta si hay algo que revisar.
  const conteoDuplicadasQuery = supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .eq("es_duplicada", true);

  const [{ data: cuentasPlaid }, { data: cuentasManuales }, { count: totalDuplicadas }] = await Promise.all([
    cuentasQuery,
    manualesQuery,
    conteoDuplicadasQuery,
  ]);

  const cuentasSeleccionadas = parsearCuentasSeleccionadas(searchParams.cuentas);
  const categoriaSeleccionada = parsearCategoriaSeleccionada(searchParams.categoria);
  // tipoReporte separa el reporte/lista entre dinero que SALIÓ (gasto) y
  // dinero que ENTRÓ (ingreso) — antes el reporte de categorías solo
  // contaba tipo_flujo === "gasto" a fuego, así que ninguna categoría de
  // ingreso podía aparecer ahí sin importar cuántas transacciones tuviera
  // bien categorizadas (aunque el guardado sí funcionaba). Con esto,
  // "Gastos"/"Ingresos" es un toggle real que cambia tanto el reporte de
  // arriba como la lista de abajo, como el Debits/Credits del BPPR.
  const tipoReporte: "gasto" | "ingreso" = searchParams.tipo === "ingreso" ? "ingreso" : "gasto";

  // Selector de mes en pantalla — reemplaza el viejo toggle binario
  // "este mes" / "todo el historial" (?historial=todo) por un selector de
  // CUALQUIER mes con transacciones, más una opción "Todo". Antes no había
  // forma de ver, por ejemplo, "cuánto envié el mes pasado" sin descargar
  // el CSV del contable.
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
    .is("entity_id", null)
    .eq("es_duplicada", false)
    .order("fecha", { ascending: false })
    .limit(LIMITE_TRANSACCIONES);
  // Multi-select: si hay más de una cuenta marcada, hace falta un OR real
  // (plaid_account_id.in.(...) O manual_account_id.in.(...)) porque
  // encadenar .eq()/.in() normalmente sería AND, y una transacción nunca
  // tiene las dos columnas llenas a la vez.
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

  // Historial de "esto cambió después de guardarse" (transaction_sync_log,
  // migración 0022) — para las transacciones visibles en esta pantalla,
  // trae la corrección más reciente que Plaid haya mandado sobre ellas
  // (típicamente: pasó de pendiente/estimada a liquidada/real). Se muestra
  // como una notita en GastosList para que nunca vuelva a pasar lo que le
  // pasó a Joel el 22 de agosto: una transacción "desaparece" sin que
  // quede claro por qué.
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

  // Solo el cambio más reciente por transacción — con .order() descendente
  // arriba, el primer .set() de cada id ya es el más nuevo.
  const cambioPorTransaccion: Record<
    string,
    { descripcionAnterior: string | null; montoAnterior: number | null; fecha: string }
  > = {};
  for (const c of cambiosRecientes ?? []) {
    if (cambioPorTransaccion[c.transaction_id]) continue;
    cambioPorTransaccion[c.transaction_id] = {
      descripcionAnterior: c.descripcion_anterior,
      montoAnterior: c.monto_anterior,
      fecha: c.creado_en,
    };
  }

  // Meses con transacciones reales (más el mes actual, aunque todavía no
  // tenga ninguna) para pintar como pills — igual que los tabs de mes del
  // reporte del BPPR. Orden ascendente (enero → agosto, el más viejo
  // primero) porque así se lee un calendario; slice(-12) se queda con los
  // 12 más RECIENTES pero sin voltear el orden — "Todo" cubre el resto.
  const mesesDisponibles = Array.from(new Set([mesActualStr, ...(transacciones ?? []).map((t) => t.fecha.slice(0, 7))]))
    .sort()
    .slice(-12);

  // Nombre legible por cuenta (ej. "BPPR Visa ···4821") para el filtro y
  // para la etiqueta en cada fila de la lista — con el mismo prefijo
  // plaid:/manual: como llave, así GastosList sabe cuál usar para cada
  // transacción sin importar de dónde vino.
  const etiquetaCuenta = (c: { name: string | null; nickname?: string | null; mask: string | null }) =>
    `${c.nickname || c.name || "Cuenta sin nombre"}${c.mask ? ` ···${c.mask}` : ""}`;
  const nombrePorCuenta = new Map<string, string>();
  for (const c of cuentasPlaid ?? []) nombrePorCuenta.set(idConPrefijo("plaid", c.plaid_account_id), etiquetaCuenta(c));
  for (const c of cuentasManuales ?? []) nombrePorCuenta.set(idConPrefijo("manual", c.id), etiquetaCuenta(c));

  const totalCuentas = (cuentasPlaid?.length ?? 0) + (cuentasManuales?.length ?? 0);

  // Reporte del mes por categoría — mismo cálculo que /dashboard/resumen,
  // pero aquí mismo en Gastos, que es donde el usuario lo busca primero.
  // "hoy" se conserva (no confundir con mesSeleccionado/mesActualStr de
  // arriba) porque el bloque de rangosReporte del CSV para el contable,
  // más abajo, sigue usando hoy.getFullYear()/getMonth() para sus propios
  // rangos (Este mes, Trimestre, YTD...), que son independientes del
  // selector de mes de este reporte.
  const hoy = new Date();
  const nombrePorCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  // catKey identifica cada categoría en la URL (?categoria=) y en el
  // filtro de la lista de abajo: el id numérico real de hacienda_categories
  // como texto, o "sin_categorizar" para las que no tienen ninguna — así
  // el usuario puede tocar cualquier fila del reporte y ver exactamente
  // qué transacciones cayeron ahí, para confirmar que VICTOR categorizó
  // bien o corregir la que no.
  // Antes este reporte solo contaba tipo_flujo === "gasto" a fuego, así
  // que ninguna categoría de ingreso podía aparecer aquí sin importar
  // cuántas transacciones tuviera bien categorizadas ("categoricé varias
  // en 'Ingresos por servicios' y nunca se añade como categoría nueva
  // ahí"). Ahora filtra por tipoReporte, que cambia con el toggle
  // Gastos/Ingresos de arriba.
  //
  // También respeta el mes seleccionado (mesSeleccionado/dentroDelRango,
  // arriba) en vez del viejo binario "este mes"/"todo el historial" —
  // ahora se puede ver, por ejemplo, julio 2026 específicamente.
  const gastoPorCategoria = new Map<string, { nombre: string; monto: number }>();
  let gastosBaseParaPct = 0;
  for (const t of transacciones ?? []) {
    if (t.tipo_flujo !== tipoReporte) continue;
    const sinCategoria = !t.hacienda_category_id;
    const dentroDelMes = dentroDelRango(t.fecha);
    // "Sin categorizar" se acumula SIEMPRE, sin importar el mes elegido —
    // es lo que el usuario todavía tiene que resolver, no un gasto/ingreso
    // de un mes puntual nada más. Las categorías reales sí se limitan al
    // mes seleccionado.
    if (!sinCategoria && !dentroDelMes) continue;
    // Denominador de los % — mismo alcance que lo que se está sumando
    // arriba, para que el reporte siempre sume 100% real de lo que se ve
    // en pantalla. Los montos de ingreso se guardan en negativo en la
    // base de datos (convención de tipo_flujo), así que se usa Math.abs
    // para que el reporte de Ingresos no muestre números negativos —
    // mismo ajuste que ya se hizo en la tarjeta de Ingresos del Home.
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

  // Resumen de los 3 totales del mes — independiente del toggle
  // Gastos/Ingresos de arriba, para que se vea de un vistazo cuánto entró,
  // cuánto salió de verdad como gasto, y cuánto fue a ahorro/inversión,
  // sin tener que sumar el reporte de categorías a mano ni cambiar el
  // toggle para verlo. "Ahorro e inversión" se cuenta aparte de "gastos
  // reales": aunque hoy vive como una categoría más de tipo_flujo "gasto"
  // en la base de datos, mover dinero a ahorro/inversión no es lo mismo
  // que gastarlo, y Joel pidió específicamente poder ver esa suma sin
  // mezclar. "Sin categorizar" sí cuenta como gasto real (es dinero que
  // salió, solo falta clasificar en qué).
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

  // La lista de transacciones de abajo: siempre respeta tipoReporte (para
  // que nunca se mezclen gastos e ingresos en la misma vista) y, si hay
  // una categoría REAL seleccionada, respeta también el mes elegido
  // arriba. "Sin categorizar" sigue siendo especial a propósito: NUNCA se
  // limita al mes seleccionado — un gasto de julio sin categorizar sigue
  // pendiente aunque ya no sea "este mes", y el usuario necesita verlo
  // para resolverlo, no que desaparezca de la vista.
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

  // Constructor único de links para los 4 filtros de esta pantalla (cuenta,
  // tipo, mes, categoría) — reemplaza los antiguos hrefHistorial/
  // hrefConCategoria, que cada uno conservaba manualmente un subconjunto
  // distinto de parámetros y por eso se desincronizaban entre sí (ej.
  // tocar una categoría en modo "todo el historial" te devolvía a "este
  // mes" sin avisar, porque hrefConCategoria no sabía de ?historial=).
  // Reglas: cuenta siempre se conserva; cambiar de tipo (gasto↔ingreso)
  // resetea la categoría, porque una categoría de un lado no existe en el
  // reporte del otro; cambiar solo de mes, o abrir/cerrar una categoría,
  // conserva todo lo demás tal cual está.
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
    return `/dashboard/gastos${qs ? `?${qs}` : ""}`;
  }

  // Opciones del dropdown de categoría (Todas / Sin categorizar / cada
  // categoría real, global o personal) — lista completa de
  // hacienda_categories, independiente de si tiene o no transacciones en
  // el mes/tipo actual (a diferencia de reporteCategoria, que solo trae
  // las que sí tienen movimiento en el alcance de pantalla). Así el
  // usuario puede saltar directo a cualquier categoría, incluso una que
  // acaba de crear y todavía no tiene ninguna transacción.
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

  // Rangos rápidos para el reporte del contable — el CSV (/api/transacciones/
  // exportar) ya acepta ?desde=&hasta=, esto solo arma los links con las
  // fechas correctas. "Año pasado" existe específicamente para radicar
  // planillas (ej. en marzo 2027 necesitas 1 ene – 31 dic 2026).
  const anioActual = hoy.getFullYear();
  const rangosReporte: { label: string; desde?: string; hasta?: string }[] = [
    { label: "Este mes", desde: fmt(new Date(anioActual, hoy.getMonth(), 1)), hasta: fmt(hoy) },
    {
      label: "Mes anterior",
      desde: fmt(new Date(anioActual, hoy.getMonth() - 1, 1)),
      hasta: fmt(new Date(anioActual, hoy.getMonth(), 0)),
    },
    {
      label: "Trimestre",
      desde: fmt(new Date(anioActual, Math.floor(hoy.getMonth() / 3) * 3, 1)),
      hasta: fmt(hoy),
    },
    { label: "YTD", desde: fmt(new Date(anioActual, 0, 1)), hasta: fmt(hoy) },
    { label: `Año ${anioActual - 1} (planillas)`, desde: fmt(new Date(anioActual - 1, 0, 1)), hasta: fmt(new Date(anioActual - 1, 11, 31)) },
    { label: "Todo", desde: undefined, hasta: undefined },
  ];

  return (
    <div className="vc-shell">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-medium">Transacciones</h1>
        {!!totalDuplicadas && (
          <Link href="/dashboard/gastos/duplicados" className="text-xs font-medium text-amb hover:opacity-80">
            {totalDuplicadas} posible{totalDuplicadas === 1 ? "" : "s"} duplicado{totalDuplicadas === 1 ? "" : "s"} →
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ReporteContableDropdown rangos={rangosReporte} />
        {totalCuentas > 1 && (
          <CuentaDropdown
            opciones={Array.from(nombrePorCuenta.entries()).map(([clave, nombre]) => ({ clave, nombre }))}
            // Por defecto (sin ?cuentas= en la URL) los checkboxes arrancan
            // desmarcados — CuentaDropdown ya trae su propio botón "Todas
            // las cuentas" para marcarlas todas de un tiro cuando el
            // usuario lo pida.
            seleccionadas={cuentasSeleccionadas.map((c) => idConPrefijo(c.origen, c.id))}
          />
        )}
        <CategoriaDropdown opciones={opcionesCategoria} />
      </div>

      {/* Toggle Gastos/Ingresos — mismo rol que "Debits"/"Credits" en el
      reporte del BPPR. Cambia tipoReporte, que a su vez filtra tanto el
      reporte de categorías como la lista de transacciones de abajo. */}
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

      {/* Selector de mes en pantalla — reemplaza el viejo link único "Ver
      historial completo →" por pills de cada mes con transacciones más
      "Todo", igual que los tabs de mes del reporte del BPPR. */}
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
          className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${
            esTodo ? "border-teal text-teal" : "text-muted"
          }`}
          style={{ borderColor: esTodo ? undefined : "var(--border)" }}
        >
          Todo
        </Link>
      </div>

      {/* Los 3 totales del mes de un vistazo — ver comentario junto a
      totalIngresosMes/totalGastosRealesMes/totalAhorroInversionMes arriba.
      Siempre visible sin importar el toggle Gastos/Ingresos, porque es
      justamente la vista que junta las dos cosas (más ahorro/inversión
      aparte) en un solo lugar. */}
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
              // "Sin categorizar" siempre suma TODO el historial pendiente
              // (ver comentario arriba), incluso con el toggle en "este
              // mes" — así que su monto puede ser mayor que
              // gastosBaseParaPct y el % saldría por encima de 100. Se
              // limita a 100 solo para que la barra no se salga de su
              // contenedor; el monto en dólares de al lado sigue siendo el
              // real, sin recortar.
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
                    <span className={r.nombre === "Sin categorizar" ? "text-muted" : activa ? "font-medium text-teal" : ""}>
                      {r.nombre}
                    </span>
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

      {/* Mismo alcance visible aquí también cuando no hay categoría tocada
      — antes esta lista podía mostrar un alcance distinto al del reporte
      de arriba sin avisar, que era la causa real de "el reporte dice 1
      pero abajo veo 3 o 4". El selector de mes/tipo de arriba ya cubre el
      cambio de vista, así que aquí solo queda el estado actual. */}
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
                : "Todavía no hay transacciones."}
            </p>
            {!categoriaSeleccionada && (
              <p className="mt-1 text-xs text-muted">Se llenan solas cuando conectes tu banco en la pestaña Cuentas.</p>
            )}
          </div>
        )}

        {transaccionesMostradas.length > 0 && (
          <GastosList
            // key fuerza a React a montar una instancia nueva del componente
            // cuando cambia el filtro de cuenta, de categoría, o de
            // historial (este mes / todo) — sin esto, GastosList es un
            // Client Component con su propio useState(transaccionesIniciales),
            // y React reusa la instancia vieja (con las transacciones del
            // filtro anterior) en vez de tomar las nuevas props, aunque el
            // servidor ya mandó la lista correcta. Antes esto pasaba con
            // cuenta/categoría; el mismo bug apareció de nuevo al agregar
            // "Ver historial completo →" porque ese link solo cambiaba un
            // parámetro que no estaba en el key — ahora el key incluye
            // tipo y mes explícitamente, que son los dos filtros nuevos de
            // esta pantalla, además de cuenta y categoría de siempre.
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
            cuenta arriba o descarga el reporte completo
            para tu contable si necesitas todo el historial.
          </p>
        )}
      </div>
    </div>
  );
}
