import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";

// Tab "Resumen" — disponible en Core (no solo en Pro). Por ahora es un
// resumen de lo personal (gastos, metas, alertas), con números reales de
// Supabase. Cuando el multi-entidad de Pro esté listo, esta pantalla
// también consolidará Negocio + Personal, como en el mockup — por ahora
// solo hay Personal, así que eso es lo que se resume.
export default async function ResumenPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const mesLbl = hoy.toLocaleDateString("es-PR", { month: "long", year: "numeric" });

  const { data: transacciones } = await supabase
    .from("transactions")
    .select("amount, hacienda_category_id")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .gte("fecha", inicioMes);

  const gastosDelMes = (transacciones ?? []).reduce((sum, t) => sum + (t.amount > 0 ? Number(t.amount) : 0), 0);

  // Reporte contable básico: gastos del mes agrupados por categoría. El
  // agrupado se hace aquí en JS (no en SQL) porque el volumen mensual de un
  // usuario Core es chico — si esto crece mucho, se puede mover a una vista
  // o función de Postgres más adelante.
  const { data: categoriasDisponibles } = await supabase
    .from("hacienda_categories")
    .select("id, nombre")
    .eq("activo", true);
  const nombrePorCategoria = new Map((categoriasDisponibles ?? []).map((c) => [c.id, c.nombre]));

  const gastoPorCategoria = new Map<string, number>();
  for (const t of transacciones ?? []) {
    if (Number(t.amount) <= 0) continue; // solo gastos, no depósitos/ingresos
    const nombre = t.hacienda_category_id ? nombrePorCategoria.get(t.hacienda_category_id) ?? "Sin categorizar" : "Sin categorizar";
    gastoPorCategoria.set(nombre, (gastoPorCategoria.get(nombre) ?? 0) + Number(t.amount));
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

  const en30dias = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);
  const alertasProximas = (docs ?? []).filter((d) => new Date(d.fecha_vencimiento) <= en30dias).length;

  return (
    <div className="vc-shell">
      <div className="mb-4">
        <h1 className="text-xl font-medium">Resumen</h1>
        <p className="mt-0.5 text-xs capitalize text-muted">Personal · {mesLbl}</p>
      </div>

      <div className="vc-card mb-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Este mes</p>
        <div className="rw flex justify-between border-b border-border py-2 text-sm">
          <span className="text-muted">Gastos</span>
          <span className="font-medium text-red">
            <Sensitive>{formatMoney(gastosDelMes)}</Sensitive>
          </span>
        </div>
        <div className="rw flex justify-between py-2 text-sm">
          <span className="text-muted">Alertas por vencer (30 días)</span>
          <span className="font-medium">{alertasProximas}</span>
        </div>
      </div>

      <div className="vc-card mb-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Gastos por categoría</p>
        {reporteCategoria.length === 0 ? (
          <p className="text-xs text-muted">Sin gastos categorizados este mes todavía.</p>
        ) : (
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
        )}
        {reporteCategoria.some(([nombre]) => nombre === "Sin categorizar") && (
          <p className="mt-3 text-xs text-muted">
            Corrige las que digan "Sin categorizar" desde <a href="/dashboard/gastos" className="text-teal">Gastos</a> o
            dile a VICTOR a qué categoría pertenecen — mientras más corrijas, más precisas salen las próximas.
          </p>
        )}
      </div>

      <div className="vc-card mb-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Metas</p>
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
        <p className="text-xs text-muted">
          Cuando actives VICTOR Pro y conectes un negocio, este resumen también va a consolidar
          Negocio + Personal en un solo total — por ahora solo tienes cuenta personal, así que este
          es tu resumen completo.
        </p>
      </div>
    </div>
  );
}
