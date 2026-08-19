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

// Lista de transacciones personales. Vacía hasta que Plaid esté conectado
// (Cuentas) — es honesto mostrarlo así en vez de simular datos. La
// categoría real vive en hacienda_category_id (la llena el motor de
// categorización de 0001_schema_completo.sql + la siembra de 0011) — la
// columna "category" de texto nunca se usa, por eso antes siempre salía
// "sin categorizar". Click en la fecha/categoría para corregirla a mano.
export default async function GastosPage({
  searchParams,
}: {
  searchParams: { cuenta?: string };
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
  // las que parecen de negocio).
  let cuentasQuery = supabase
    .from("plaid_accounts")
    .select("plaid_account_id, name, mask, type, subtype")
    .eq("owner_id", user.id)
    .order("name");
  if (!esPro) cuentasQuery = cuentasQuery.eq("es_negocio", false);
  const { data: cuentasPlaid } = await cuentasQuery;

  const cuentaSeleccionada = searchParams.cuenta || null;

  let transaccionesQuery = supabase
    .from("transactions")
    .select("id, description_raw, amount, fecha, hacienda_category_id, plaid_account_id")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .order("fecha", { ascending: false })
    .limit(LIMITE_TRANSACCIONES);
  if (cuentaSeleccionada) transaccionesQuery = transaccionesQuery.eq("plaid_account_id", cuentaSeleccionada);

  const [{ data: transacciones, error }, { data: categorias }] = await Promise.all([
    transaccionesQuery,
    supabase.from("hacienda_categories").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

  // Nombre legible por cuenta (ej. "BPPR Visa ···4821") para el filtro y
  // para la etiqueta en cada fila de la lista.
  const etiquetaCuenta = (c: { name: string | null; mask: string | null }) =>
    `${c.name ?? "Cuenta sin nombre"}${c.mask ? ` ···${c.mask}` : ""}`;
  const nombrePorCuenta = new Map((cuentasPlaid ?? []).map((c) => [c.plaid_account_id, etiquetaCuenta(c)]));

  // Reporte del mes por categoría — mismo cálculo que /dashboard/resumen,
  // pero aquí mismo en Gastos, que es donde el usuario lo busca primero.
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const nombrePorCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  const gastoPorCategoria = new Map<string, number>();
  let gastosDelMes = 0;
  for (const t of transacciones ?? []) {
    if (t.fecha < inicioMes || Number(t.amount) <= 0) continue;
    gastosDelMes += Number(t.amount);
    const nombre = t.hacienda_category_id ? nombrePorCategoria.get(t.hacienda_category_id) ?? "Sin categorizar" : "Sin categorizar";
    gastoPorCategoria.set(nombre, (gastoPorCategoria.get(nombre) ?? 0) + Number(t.amount));
  }
  const reporteCategoria = Array.from(gastoPorCategoria.entries()).sort((a, b) => b[1] - a[1]);

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

      {cuentasPlaid && cuentasPlaid.length > 1 && (
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
          {cuentasPlaid.map((c) => (
            <Link
              key={c.plaid_account_id}
              href={`/dashboard/gastos?cuenta=${encodeURIComponent(c.plaid_account_id)}`}
              className={`rounded-pill border px-3 py-1.5 text-xs font-medium hover:opacity-80 ${
                cuentaSeleccionada === c.plaid_account_id ? "border-teal text-teal" : "text-muted"
              }`}
              style={{ borderColor: cuentaSeleccionada === c.plaid_account_id ? undefined : "var(--border)" }}
            >
              {etiquetaCuenta(c)}
            </Link>
          ))}
        </div>
      )}

      {reporteCategoria.length > 0 && (
        <div className="vc-card mb-3">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Reporte del mes por categoría</p>
          <div className="flex flex-col gap-2">
            {reporteCategoria.map(([nombre, monto]) => {
              const pct = gastosDelMes > 0 ? Math.round((monto / gastosDelMes) * 100) : 0;
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
        </div>
      )}

      <div className="vc-card">
        {error && <p className="text-xs text-amb">No se pudo leer transactions ({error.message}).</p>}

        {!error && (!transacciones || transacciones.length === 0) && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted">Todavía no hay transacciones.</p>
            <p className="mt-1 text-xs text-muted">
              Se llenan solas cuando conectes tu banco en la pestaña Cuentas.
            </p>
          </div>
        )}

        {transacciones && transacciones.length > 0 && (
          <GastosList
            // key fuerza a React a montar una instancia nueva del componente
            // cuando cambia el filtro de cuenta — sin esto, GastosList es un
            // Client Component con su propio useState(transaccionesIniciales),
            // y React reusa la instancia vieja (con las transacciones de la
            // cuenta anterior) en vez de tomar las nuevas props, aunque el
            // servidor ya mandó la lista correcta. Por eso hacía falta
            // refrescar la página a mano para ver el cambio.
            key={cuentaSeleccionada ?? "todas"}
            transaccionesIniciales={transacciones}
            categorias={categorias ?? []}
            nombrePorCuenta={Object.fromEntries(nombrePorCuenta)}
          />
        )}
        {transacciones && transacciones.length === LIMITE_TRANSACCIONES && (
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
