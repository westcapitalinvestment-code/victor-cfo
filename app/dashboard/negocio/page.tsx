import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { saludoPorHora } from "@/lib/hora-pr";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Inicio de negocio — versión ligera del mockup "VICTOR — Dashboard Pro.html"
// (Inicio con contexto Negocio): saludo, Facturado/Cobrado/Pendiente,
// facturas recientes, metas del negocio, alertas — todo ya real, scoped por
// la entidad activa (mismo mecanismo que Facturación).
//
// A propósito NO incluye la tarjeta de balance bancario del mockup
// ("Ingresos del mes · BPPR ••4821") — todavía no existe forma de conectar
// una cuenta (Plaid o manual) a una entidad de negocio, así que mostrar esa
// tarjeta hoy sería inventar un número. Esa pieza llega con Cuentas de
// negocio, que queda para otra sesión.
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

  const [{ data: facturasRaw }, { data: goals }, { data: documentos }] = await Promise.all([
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
  ]);

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

      <div className="vc-card mb-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted">Metas del negocio</p>
          <Link href="/dashboard/negocio/metas" className="text-xs font-medium text-teal hover:opacity-80">
            ver todas →
          </Link>
        </div>
        {metasTotal === 0 ? (
          <p className="py-3 text-center text-sm text-muted">Sin metas de negocio todavía.</p>
        ) : (
          <p className="py-2 text-sm text-muted">
            {formatMoney(metasAhorrado)} / {formatMoney(metasObjetivo)} · {metasTotal} meta{metasTotal === 1 ? "" : "s"}
          </p>
        )}
      </div>

      <div className="vc-card">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted">
            Alertas {totalAlertas > 0 && <span className="ml-1 rounded bg-amb/20 px-1.5 py-0.5 text-[10px] text-amb">{totalAlertas} pendientes</span>}
          </p>
        </div>

        {totalAlertas === 0 && <p className="py-3 text-center text-sm text-muted">Todo al día.</p>}

        {facturasVencidas.map((f) => (
          <div key={f.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
            <span>
              <i className="ti ti-alert-triangle mr-1.5" style={{ color: "#B7304A", fontSize: 14 }} />
              Factura vencida — {f.clients?.name ?? "Sin cliente"}
            </span>
            <Link href={`/dashboard/facturacion/${f.id}`} className="text-xs font-medium text-teal">
              Cobrar →
            </Link>
          </div>
        ))}

        {documentosPorVencer.map((d) => (
          <div key={d.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
            <span>
              <i className="ti ti-clock mr-1.5" style={{ color: "var(--amb)", fontSize: 14 }} />
              {d.nombre} vence {d.fecha_vencimiento}
            </span>
            <Link href="/dashboard/negocio/documentos" className="text-xs font-medium text-teal">
              Ver →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
