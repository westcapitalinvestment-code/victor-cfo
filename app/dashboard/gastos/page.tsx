import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import GastosList from "./gastos-list";
import ReporteRangoDropdown from "./reporte-rango-dropdown";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
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
  searchParams: { cuenta?: string; categoria?: string; historial?: string };
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
    .select("plaid_account_id, name, mask, type, subtype")
    .eq("owner_id", user.id)
    .order("name");
  if (!esPro) cuentasQuery = cuentasQuery.eq("es_negocio", false);

  let manualesQuery = supabase
    .from("manual_accounts")
    .select("id, name, mask, type, subtype")
    .eq("owner_id", user.id)
    .order("name");
  if (!esPro) manualesQuery = manualesQuery.eq("es_negocio", false);

  const [{ data: cuentasPlaid }, { data: cuentasManuales }] = await Promise.all([cuentasQuery, manualesQuery]);

  const cuentaSeleccionada = parsearCuentaSeleccionada(searchParams.cuenta);
  const categoriaSeleccionada = parsearCategoriaSeleccionada(searchParams.categoria);
  // Cuando NO hay categoría tocada, la lista de abajo antes mostraba TODO
  // el historial de la cuenta sin límite de mes, mientras que el "Reporte
  // del mes por categoría" arriba de ella sí es solo de este mes — dos
  // secciones una encima de la otra con alcances distintos, que es
  // justo lo que confundía: "el reporte dice 1 en Vivienda pero abajo veo
  // 3 o 4" (las de más abajo eran de meses anteriores). Ahora por defecto
  // la lista también es de este mes, y hay un link explícito para ver todo.
  const verHistorialCompleto = searchParams.historial === "todo";

  let transaccionesQuery = supabase
    .from("transactions")
    .select("id, description_raw, amount, fecha, hacienda_category_id, plaid_account_id, manual_account_id, tipo_flujo")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .order("fecha", { ascending: false })
    .limit(LIMITE_TRANSACCIONES);
  if (cuentaSeleccionada?.origen === "plaid") {
    transaccionesQuery = transaccionesQuery.eq("plaid_account_id", cuentaSeleccionada.id);
  } else if (cuentaSeleccionada?.origen === "manual") {
    transaccionesQuery = transaccionesQuery.eq("manual_account_id", cuentaSeleccionada.id);
  }

  const [{ data: transacciones, error }, { data: categorias }] = await Promise.all([
    transaccionesQuery,
    supabase.from("hacienda_categories").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  // Nombre legible por cuenta (ej. "BPPR Visa ···4821") para el filtro y
  // para la etiqueta en cada fila de la lista — con el mismo prefijo
  // plaid:/manual: como llave, así GastosList sabe cuál usar para cada
  // transacción sin importar de dónde vino.
  const etiquetaCuenta = (c: { name: string | null; mask: string | null }) =>
    `${c.name ?? "Cuenta sin nombre"}${c.mask ? ` ···${c.mask}` : ""}`;
  const nombrePorCuenta = new Map<string, string>();
  for (const c of cuentasPlaid ?? []) nombrePorCuenta.set(idConPrefijo("plaid", c.plaid_account_id), etiquetaCuenta(c));
  for (const c of cuentasManuales ?? []) nombrePorCuenta.set(idConPrefijo("manual", c.id), etiquetaCuenta(c));

  const totalCuentas = (cuentasPlaid?.length ?? 0) + (cuentasManuales?.length ?? 0);

  // Reporte del mes por categoría — mismo cálculo que /dashboard/resumen,
  // pero aquí mismo en Gastos, que es donde el usuario lo busca primero.
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const nombrePorCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  // catKey identifica cada categoría en la URL (?categoria=) y en el
  // filtro de la lista de abajo: el id numérico real de hacienda_categories
  // como texto, o "sin_categorizar" para las que no tienen ninguna — así
  // el usuario puede tocar cualquier fila del reporte y ver exactamente
  // qué transacciones cayeron ahí, para confirmar que VICTOR categorizó
  // bien o corregir la que no.
  // Antes filtraba por Number(t.amount) <= 0, que trataba cualquier monto
  // positivo como gasto real — eso metía en el reporte los pagos de tarjeta
  // de crédito hechos desde el checking (transferencia entre tus propias
  // cuentas, no gasto nuevo, porque la compra original ya se contó del
  // lado de la tarjeta). Ahora filtra por tipo_flujo === "gasto", que ya
  // viene calculado bien desde la base de datos.
  const gastoPorCategoria = new Map<string, { nombre: string; monto: number }>();
  let gastosDelMes = 0;
  for (const t of transacciones ?? []) {
    if (t.tipo_flujo !== "gasto") continue;
    const sinCategoria = !t.hacienda_category_id;
    // "Sin categorizar" se acumula SIEMPRE, sin importar el mes — es lo que
    // el usuario todavía tiene que resolver, no un gasto de este mes nada
    // más (antes esto se limitaba a inicioMes igual que las categorías
    // reales, y la fila "Sin categorizar" del reporte mostraba un número
    // mucho menor que el total real de pendientes). Las categorías reales
    // sí se quedan limitadas al mes en curso, que es lo que promete el
    // título "Reporte del mes por categoría".
    if (!sinCategoria && t.fecha < inicioMes) continue;
    if (t.fecha >= inicioMes) gastosDelMes += Number(t.amount);
    const catKey = sinCategoria ? SIN_CATEGORIZAR : String(t.hacienda_category_id);
    const nombre = sinCategoria ? "Sin categorizar" : nombrePorCategoria.get(t.hacienda_category_id!) ?? "Sin categorizar";
    const actual = gastoPorCategoria.get(catKey) ?? { nombre, monto: 0 };
    actual.monto += Number(t.amount);
    gastoPorCategoria.set(catKey, actual);
  }
  const reporteCategoria = Array.from(gastoPorCategoria.entries())
    .map(([catKey, v]) => ({ catKey, nombre: v.nombre, monto: v.monto }))
    .sort((a, b) => b.monto - a.monto);

  // La lista de transacciones de abajo: si hay una categoría REAL
  // seleccionada en el reporte de arriba, se filtra a esa categoría Y al
  // mes en curso (mismo alcance que el reporte, para que los números
  // cuadren con lo que el usuario tocó). "Sin categorizar" es distinto a
  // propósito: NO se limita al mes en curso — un gasto de julio sin
  // categorizar sigue pendiente aunque ya no sea "este mes", y el usuario
  // necesita verlo para resolverlo, no que desaparezca de la vista. Antes
  // esto sí limitaba por mes, que era justo el bug: la tarjeta de
  // "pendientes" en Inicio avisaba de 33 sin categorizar, pero aquí solo
  // aparecían las de este mes (a veces 3 o 4), como si el resto no existiera.
  const transaccionesMostradas = categoriaSeleccionada
    ? (transacciones ?? []).filter((t) => {
        if (categoriaSeleccionada.tipo === "sin_categorizar") return !t.hacienda_category_id;
        if (t.fecha < inicioMes) return false;
        return t.hacienda_category_id === categoriaSeleccionada.id;
      })
    : verHistorialCompleto
      ? transacciones ?? []
      : (transacciones ?? []).filter((t) => t.fecha >= inicioMes);

  const nombreCategoriaSeleccionada = categoriaSeleccionada
    ? reporteCategoria.find((r) =>
        categoriaSeleccionada.tipo === "sin_categorizar" ? r.catKey === SIN_CATEGORIZAR : r.catKey === String(categoriaSeleccionada.id)
      )?.nombre ?? "Sin categorizar"
    : null;

  // Link para alternar entre "este mes" y "todo el historial" en la lista
  // de abajo cuando no hay categoría tocada — conserva el filtro de cuenta.
  function hrefHistorial(verTodo: boolean) {
    const params = new URLSearchParams();
    if (searchParams.cuenta) params.set("cuenta", searchParams.cuenta);
    if (verTodo) params.set("historial", "todo");
    const qs = params.toString();
    return `/dashboard/gastos${qs ? `?${qs}` : ""}`;
  }

  // Conserva el filtro de cuenta activo (si hay) al armar el link de cada
  // categoría, para que los dos filtros se puedan combinar sin perderse
  // uno al tocar el otro.
  function hrefConCategoria(catKey: string | null) {
    const params = new URLSearchParams();
    if (searchParams.cuenta) params.set("cuenta", searchParams.cuenta);
    if (catKey) params.set("categoria", catKey);
    const qs = params.toString();
    return `/dashboard/gastos${qs ? `?${qs}` : ""}`;
  }

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
        <h1 className="text-lg font-medium">Gastos</h1>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted">Reporte para tu contable:</span>
        {rangosReporte.map((r) => {
          const params = new URLSearchParams();
          if (r.desde) params.set("desde", r.desde);
          if (r.hasta) params.set("hasta", r.hasta);
          const qs = params.toString();
          return (
            <a key={r.label} href={`/api/transacciones/exportar${qs ? `?${qs}` : ""}`} className="rounded-pill border px-3 py-1.5 text-xs font-medium text-muted hover:opacity-80" style={{ borderColor: "var(--border)" }}>
              ↓ {r.label}
            </a>
          );
        })}
        <ReporteRangoDropdown />
      </div>

      {totalCuentas > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-muted">Cuenta:</span>
          <Link
            href="/dashboard/gastos"
            className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${
              !cuentaSeleccionada ? "border-teal text-teal" : "text-muted"
            }`}
            style={{ borderColor: !cuentaSeleccionada ? undefined : "var(--border)" }}
          >
            Todas
          </Link>
          {(cuentasPlaid ?? []).map((c) => {
            const clave = idConPrefijo("plaid", c.plaid_account_id);
            const activa = cuentaSeleccionada?.origen === "plaid" && cuentaSeleccionada.id === c.plaid_account_id;
            return (
              <Link
                key={clave}
                href={`/dashboard/gastos?cuenta=${encodeURIComponent(clave)}`}
                className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${activa ? "border-teal text-teal" : "text-muted"}`}
                style={{ borderColor: activa ? undefined : "var(--border)" }}
              >
                {etiquetaCuenta(c)}
              </Link>
            );
          })}
          {(cuentasManuales ?? []).map((c) => {
            const clave = idConPrefijo("manual", c.id);
            const activa = cuentaSeleccionada?.origen === "manual" && cuentaSeleccionada.id === c.id;
            return (
              <Link
                key={clave}
                href={`/dashboard/gastos?cuenta=${encodeURIComponent(clave)}`}
                className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${activa ? "border-teal text-teal" : "text-muted"}`}
                style={{ borderColor: activa ? undefined : "var(--border)" }}
              >
                {etiquetaCuenta(c)}
              </Link>
            );
          })}
        </div>
      )}

      {reporteCategoria.length > 0 && (
        <div className="vc-card mb-3">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">
            Reporte del mes por categoría — toca una para ver sus transacciones
          </p>
          <div className="flex flex-col gap-2">
            {reporteCategoria.map((r) => {
              // "Sin categorizar" ahora suma TODO el historial pendiente, no
              // solo este mes (ver comentario arriba) — así que su monto
              // puede ser mayor que gastosDelMes (el gasto de este mes) y el
              // % saldría por encima de 100. Se limita a 100 solo para que
              // la barra no se salga de su contenedor; el monto en dólares
              // de al lado sigue siendo el real, sin recortar.
              const pctReal = gastosDelMes > 0 ? Math.round((r.monto / gastosDelMes) * 100) : 0;
              const pct = Math.min(pctReal, 100);
              const activa = categoriaSeleccionada
                ? categoriaSeleccionada.tipo === "sin_categorizar"
                  ? r.catKey === SIN_CATEGORIZAR
                  : r.catKey === String(categoriaSeleccionada.id)
                : false;
              return (
                <Link
                  key={r.catKey}
                  href={hrefConCategoria(activa ? null : r.catKey)}
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
            {categoriaSeleccionada?.tipo === "sin_categorizar" ? "todo el historial" : "este mes"} ·{" "}
            {transaccionesMostradas.length} transacción(es)
          </span>
          <Link href={hrefConCategoria(null)} className="font-medium text-teal hover:opacity-80">
            ✕ Quitar filtro
          </Link>
        </div>
      )}

      {/* Mismo alcance visible aquí también cuando no hay categoría tocada
      — antes esta lista mostraba todo el historial sin decirlo, mientras
      el reporte de arriba era solo de este mes, y esa diferencia de
      alcance silenciosa era la causa real de "el reporte dice 1 pero
      abajo veo 3 o 4". */}
      {!categoriaSeleccionada && (
        <div className="mb-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)" }}>
          <span className="text-muted">
            Mostrando: <span className="font-medium text-text">{verHistorialCompleto ? "todo el historial" : "este mes"}</span> ·{" "}
            {transaccionesMostradas.length} transacción(es)
          </span>
          <Link href={hrefHistorial(!verHistorialCompleto)} className="font-medium text-teal hover:opacity-80">
            {verHistorialCompleto ? "Ver solo este mes →" : "Ver historial completo →"}
          </Link>
        </div>
      )}

      <div className="vc-card">
        {error && <p className="text-xs text-amb">No se pudo leer transactions ({error.message}).</p>}

        {!error && transaccionesMostradas.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted">
              {categoriaSeleccionada ? "No hay transacciones en esta categoría este mes." : "Todavía no hay transacciones."}
            </p>
            {!categoriaSeleccionada && (
              <p className="mt-1 text-xs text-muted">Se llenan solas cuando conectes tu banco en la pestaña Cuentas.</p>
            )}
          </div>
        )}

        {transaccionesMostradas.length > 0 && (
          <GastosList
            // key fuerza a React a montar una instancia nueva del componente
            // cuando cambia el filtro de cuenta o de categoría — sin esto,
            // GastosList es un Client Component con su propio
            // useState(transaccionesIniciales), y React reusa la instancia
            // vieja (con las transacciones del filtro anterior) en vez de
            // tomar las nuevas props, aunque el servidor ya mandó la lista
            // correcta. Por eso hacía falta refrescar la página a mano para
            // ver el cambio.
            key={`${searchParams.cuenta ?? "todas"}-${searchParams.categoria ?? "todas"}`}
            transaccionesIniciales={transaccionesMostradas}
            categorias={categorias ?? []}
            nombrePorCuenta={Object.fromEntries(nombrePorCuenta)}
          />
        )}
        {!categoriaSeleccionada && transacciones && transacciones.length === LIMITE_TRANSACCIONES && (
          <p className="mt-3 text-center text-xs text-muted">
            Mostrando las {LIMITE_TRANSACCIONES} más recientes
            {cuentaSeleccionada ? " de esta cuenta" : ""}. Filtra por cuenta arriba o descarga el reporte completo
            para tu contable si necesitas todo el historial.
          </p>
        )}
      </div>
    </div>
  );
}
