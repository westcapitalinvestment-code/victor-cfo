import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProPaywall from "../pro-paywall";
import { formatMoney } from "@/lib/format";

// Facturación real (30-31 agosto 2026) — reemplaza el stub "en construcción".
// v1 a propósito acotado (decisión de Joel): crear factura, listarla, verla,
// marcarla pagada a mano. Cobro en línea (ATH Móvil/tarjeta), cotizaciones y
// catálogo de servicios quedan para después — ver pro-paywall.tsx para la
// lista completa prometida.
//
// El estado "vencida" no se persiste con un cron — se calcula al vuelo aquí
// (estado guardado != 'pagada' && fecha_vencimiento ya pasó) para no
// necesitar un job aparte que ande cambiando filas en la base de datos.
function estadoMostrado(estado: string, fechaVencimiento: string | null): string {
  if (estado === "pagada" || estado === "borrador") return estado;
  if (fechaVencimiento && fechaVencimiento < new Date().toISOString().slice(0, 10)) {
    return "vencida";
  }
  return estado;
}

const BADGE_STYLE: Record<string, string> = {
  borrador: "bg-border text-muted",
  enviada: "bg-teal/10 text-teal",
  vista: "bg-teal/10 text-teal",
  pagada: "bg-teal text-white",
  vencida: "bg-red/10 text-red",
};

const BADGE_LABEL: Record<string, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  vista: "Vista",
  pagada: "Pagada",
  vencida: "Vencida",
};

export default async function FacturacionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";

  if (!esPro) return <ProPaywall />;

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!entities || entities.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-8">
        <div className="vc-card text-center">
          <p className="mb-3 text-sm">Necesitas al menos una entidad de negocio antes de facturar.</p>
          <Link href="/dashboard/entidades/nueva" className="vc-btn-primary inline-block">
            Crear mi primera entidad
          </Link>
        </div>
      </div>
    );
  }

  const { data: facturas, error } = await supabase
    .from("invoices")
    .select("id, numero, total, estado, fecha_emision, fecha_vencimiento, clients(name)")
    .eq("owner_id", user.id)
    .order("fecha_emision", { ascending: false });

  return (
    <div className="vc-shell">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-muted hover:opacity-80">
          ← VICTOR
        </Link>
      </div>

      <div className="vc-card">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted">Facturas</p>
          <Link href="/dashboard/facturacion/nueva" className="text-xs font-medium text-teal hover:opacity-80">
            + Nueva factura
          </Link>
        </div>

        {error && (
          <p className="text-xs text-amb">No se pudo leer las facturas todavía ({error.message}).</p>
        )}

        {!error && (!facturas || facturas.length === 0) && (
          <p className="text-xs text-muted">
            Todavía no tienes facturas. Dale a "+ Nueva factura" arriba para crear la primera.
          </p>
        )}

        {facturas && facturas.length > 0 && (
          <ul className="flex flex-col gap-2">
            {facturas.map((f) => {
              const estado = estadoMostrado(f.estado, f.fecha_vencimiento);
              const clienteNombre = (f.clients as unknown as { name: string } | null)?.name ?? "Sin cliente";
              return (
                <li key={f.id} className="border-b border-border py-2 text-sm last:border-0">
                  <Link href={`/dashboard/facturacion/${f.id}`} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{f.numero}</p>
                      <p className="text-xs text-muted">
                        {clienteNombre} · {f.fecha_emision}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-2 py-1 text-xs font-medium ${BADGE_STYLE[estado] ?? "bg-border text-muted"}`}>
                        {BADGE_LABEL[estado] ?? estado}
                      </span>
                      <span className="font-medium">{formatMoney(Number(f.total))}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
