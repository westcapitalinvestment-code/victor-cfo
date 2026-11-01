import { createClient } from "@/lib/supabase/server";
import { DISCLAIMER_AVISOS_CORTO, avisoAplicaA, type Segmentos } from "@/lib/avisos-comun";
import AvisosOficialesLista from "./avisos-oficiales-lista";

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

    // Avisos que este usuario ya marcó como vistos (tabla avisos_archivados_usuario, 0198).
    // Si la tabla aún no existe, la consulta falla y todos salen como pendientes.
    let vistos: string[] = [];
    try {
      const { data: v, error: ev } = await supabase
        .from("avisos_archivados_usuario")
        .select("aviso_id")
        .eq("user_id", user.id)
        .in("aviso_id", avisos.map((a) => a.id));
      if (!ev && v) vistos = v.map((r: { aviso_id: string }) => r.aviso_id);
    } catch {
      /* sin migración 0198 */
    }

    return <AvisosOficialesLista avisos={avisos} vistosIniciales={vistos} disclaimer={DISCLAIMER_AVISOS_CORTO} />;
  } catch {
    return null;
  }
}
