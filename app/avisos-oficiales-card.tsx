import { createClient } from "@/lib/supabase/server";
import { DISCLAIMER_AVISOS_CORTO, avisoAplicaA, type Segmentos } from "@/lib/avisos-comun";

// Banner "Avisos oficiales" (30 oct 2026, pedido de Joel). Lo alimenta el cron
// /api/cron/avisos-oficiales, sin intervención de nadie. VICTOR CFO NO emite
// estos avisos: son resúmenes automáticos de lo que publican las fuentes
// oficiales, con enlace a la fuente y un disclaimer visible siempre.
//
// modo "cpa": el portal de contables ve todos los avisos recientes.
// modo "usuario": solo los que aplican a los módulos que el usuario usa
// (nómina, contratistas, IVU); los generales (planillas, estimadas, retiro,
// federal…) los ven todos. Si la tabla aún no existe (migración 0196 sin
// correr) o falla la consulta, no renderiza nada — nunca rompe la página.
type Aviso = {
  id: string;
  url: string;
  fuente_nombre: string;
  titulo: string;
  resumen: string;
  fecha_publicacion: string | null;
  fecha_limite: string | null;
  temas: string[];
  urgencia: "baja" | "media" | "alta";
};

function fmtFecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function diasHasta(iso: string): number {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Puerto_Rico" });
  return Math.round((new Date(`${iso}T12:00:00Z`).getTime() - new Date(`${hoy}T12:00:00Z`).getTime()) / 86400000);
}

export default async function AvisosOficialesCard({ modo }: { modo: "cpa" | "usuario" }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const desde = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await supabase
      .from("avisos_oficiales")
      .select("id, url, fuente_nombre, titulo, resumen, fecha_publicacion, fecha_limite, temas, urgencia")
      .gte("creado_at", desde)
      .order("creado_at", { ascending: false })
      .limit(12);
    if (error || !data || data.length === 0) return null;

    let avisos = data as Aviso[];
    if (modo === "usuario") {
      const [n, c, i] = await Promise.all([
        supabase.from("payroll_employees").select("id", { head: true, count: "exact" }).limit(1),
        supabase.from("vendors").select("id", { head: true, count: "exact" }).limit(1),
        supabase.from("business_entities").select("id", { head: true, count: "exact" }).eq("ivu_applies", true).limit(1),
      ]);
      const seg: Segmentos = { nomina: (n.count ?? 0) > 0, contratistas: (c.count ?? 0) > 0, ivu: (i.count ?? 0) > 0 };
      avisos = avisos.filter((a) => !(a.temas.length === 1 && a.temas[0] === "profesion") && avisoAplicaA(a.temas, seg));
    }
    // Ya vencidos hace más de 3 días no se muestran.
    avisos = avisos.filter((a) => !a.fecha_limite || diasHasta(a.fecha_limite) >= -3).slice(0, 3);
    if (avisos.length === 0) return null;

    return (
      <div className="vc-card mb-4">
        <p className="mb-3 text-sm uppercase tracking-wide text-muted">Avisos oficiales</p>
        <div className="space-y-3">
          {avisos.map((a) => {
            const dias = a.fecha_limite ? diasHasta(a.fecha_limite) : null;
            return (
              <div key={a.id} className="border-l-2 border-teal pl-3">
                <p className="text-xs text-muted">
                  {a.fuente_nombre}
                  {a.fecha_publicacion ? ` · ${fmtFecha(a.fecha_publicacion)}` : ""}
                </p>
                <p className="mt-0.5 text-sm font-medium">{a.titulo}</p>
                <p className="mt-1 text-sm">{a.resumen}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {a.fecha_limite && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        dias !== null && dias <= 7 ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      Fecha límite según la fuente: {fmtFecha(a.fecha_limite)}
                      {dias !== null && dias >= 0 ? ` (${dias === 0 ? "hoy" : `en ${dias} día${dias === 1 ? "" : "s"}`})` : ""}
                    </span>
                  )}
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-teal underline">
                    Ver fuente oficial →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-snug text-muted">{DISCLAIMER_AVISOS_CORTO}</p>
      </div>
    );
  } catch {
    return null;
  }
}
