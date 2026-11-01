import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarCorreo, enviarCorreoContacto, ESPERA_DIAS, PASOS_TOTAL } from "@/lib/email-contactos";

// Cron de lunes a viernes: envía la secuencia de 3 correos a los contactos que
// dieron permiso en la visita de un vendedor. Totalmente automático.
// Reglas: tope diario; nunca a quien se dio de baja, ya es usuario, ya tiene
// portal de contable, o pidió baja en el mercadeo en frío; se detiene tras 3
// errores seguidos; requiere dirección física (mkt_config.direccion_fisica).
export const maxDuration = 300;

const TOPE_DIARIO = 40;
const DIA = 86400000;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!process.env.CONTACTOS_FROM_EMAIL && !process.env.MKT_FROM_EMAIL) {
    return NextResponse.json({ omitido: "Falta CONTACTOS_FROM_EMAIL (o MKT_FROM_EMAIL)." });
  }
  const admin = createAdminClient();
  const { data: cfg } = await admin.from("mkt_config").select("direccion_fisica").eq("id", 1).maybeSingle();
  const direccion = String(cfg?.direccion_fisica || "").trim();
  if (!direccion) return NextResponse.json({ omitido: "Falta dirección física en mkt_config." });

  const ahora = Date.now();
  const hoyInicio = new Date(); hoyInicio.setUTCHours(0, 0, 0, 0);
  const { count: yaHoy } = await admin
    .from("socios_contactos_correo")
    .select("id", { count: "exact", head: true })
    .gte("ultimo_envio_at", hoyInicio.toISOString());
  let cupo = TOPE_DIARIO - (yaHoy ?? 0);
  if (cupo <= 0) return NextResponse.json({ omitido: "Tope diario alcanzado." });

  const { data: candidatos } = await admin
    .from("socios_contactos_correo")
    .select("id, email, nombre, tipo, socio_id, paso, permiso_at, ultimo_envio_at, errores")
    .is("baja_at", null)
    .is("detenido_razon", null)
    .lt("paso", PASOS_TOTAL)
    .lt("errores", 3)
    .order("permiso_at")
    .limit(300);

  // Solo los que ya les toca (el primero a los ~10 min del permiso, para que el
  // vendedor alcance a corregir un correo mal escrito).
  const toca = (candidatos ?? []).filter((c) => {
    if (c.paso === 0) return ahora - new Date(c.permiso_at).getTime() >= 10 * 60000;
    const sig = (c.paso + 1) as 2 | 3;
    const ultimo = c.ultimo_envio_at ? new Date(c.ultimo_envio_at).getTime() : 0;
    return ahora - ultimo >= ESPERA_DIAS[sig] * DIA;
  }).slice(0, cupo);
  if (!toca.length) return NextResponse.json({ enviados: 0, pendientes: 0 });

  const emails = toca.map((c) => c.email);
  const [{ data: usuarios }, { data: oficinas }, { data: mkt }, { data: socios }] = await Promise.all([
    admin.from("users").select("email").in("email", emails),
    admin.from("oficinas_contables").select("email, user_id").in("email", emails).not("user_id", "is", null),
    admin.from("mkt_prospectos").select("email").in("email", emails).eq("estado", "baja"),
    admin.from("socios").select("id, nombre, codigo").in("id", Array.from(new Set(toca.map((c) => c.socio_id)))),
  ]);
  const esUsuario = new Set((usuarios ?? []).map((u) => String(u.email).toLowerCase()));
  const tienePortal = new Set((oficinas ?? []).map((o) => String(o.email).toLowerCase()));
  const bajaMkt = new Set((mkt ?? []).map((m) => String(m.email).toLowerCase()));
  const socioPor = new Map((socios ?? []).map((s) => [s.id, s]));

  let enviados = 0, errores = 0, detenidos = 0;
  for (const c of toca) {
    const e = c.email.toLowerCase();
    const razon = esUsuario.has(e) ? "es_usuario" : tienePortal.has(e) ? "tiene_portal" : bajaMkt.has(e) ? "baja_previa" : null;
    if (razon) {
      detenidos++;
      await admin.from("socios_contactos_correo").update({ detenido_razon: razon }).eq("id", c.id);
      continue;
    }
    const paso = (c.paso + 1) as 1 | 2 | 3;
    const s = socioPor.get(c.socio_id);
    const msg = armarCorreo(paso, c.tipo as "contable" | "negocio", { nombre: c.nombre, vendedor: s?.nombre, codigo: s?.codigo });
    const r = await enviarCorreoContacto({ to: c.email, contactoId: c.id, ...msg, direccionFisica: direccion });
    if (r.sent) {
      enviados++;
      await admin.from("socios_contactos_correo").update({ paso, ultimo_envio_at: new Date().toISOString(), errores: 0, ultimo_error: null }).eq("id", c.id);
    } else {
      errores++;
      const n = (c.errores ?? 0) + 1;
      await admin.from("socios_contactos_correo").update({
        errores: n,
        ultimo_error: r.reason ?? "Error",
        ...(n >= 3 ? { detenido_razon: "demasiados_errores" } : {}),
      }).eq("id", c.id);
    }
    await espera(2000 + Math.random() * 2000); // goteo, no ráfaga
  }
  return NextResponse.json({ enviados, errores, detenidos });
}
