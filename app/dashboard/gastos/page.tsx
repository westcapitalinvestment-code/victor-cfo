import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GastosList from "./gastos-list";
import ReporteRangoDropdown from "./reporte-rango-dropdown";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Lista de transacciones personales. Vacía hasta que Plaid esté conectado
// (Cuentas) — es honesto mostrarlo así en vez de simular datos. La
// categoría real vive en hacienda_category_id (la llena el motor de
// categorización de 0001_schema_completo.sql + la siembra de 0011) — la
// columna "category" de texto nunca se usa, por eso antes siempre salía
// "sin categorizar". Click en la fecha/categoría para corregirla a mano.
export default async function GastosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: transacciones, error }, { data: categorias }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, description_raw, amount, fecha, hacienda_category_id")
      .eq("owner_id", user.id)
      .is("entity_id", null)
      .order("fecha", { ascending: false })
      .limit(50),
    supabase.from("hacienda_categories").select("id, nombre").eq("activo", true).order("nombre"),
  ]);

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
          <GastosList transaccionesIniciales={transacciones} categorias={categorias ?? []} />
        )}
      </div>
    </div>
  );
}
