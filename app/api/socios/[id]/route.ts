import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { sendSocioAprobadoEmail } from "@/lib/email";

// Aprobar/suspender un socio — solo el founder (mismo panel que el
// Dashboard de Operaciones, ver app/dashboard/cfo/socios-panel.tsx). Al
// aprobar por primera vez se genera el código corto que el socio va a
// compartir (ej. "ANA7F3K") — nunca antes, para que nadie pueda compartir
// un link de una solicitud todavía pendiente.
function generarCodigo(nombre: string): string {
  const base = (nombre.split(" ")[0] || "SOCIO")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const sufijo = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base || "SOCIO"}${sufijo}`;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const estado = body?.estado;
  if (estado !== "aprobado" && estado !== "suspendido" && estado !== "pendiente") {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }

  // tipo (opcional, migración 0106, 29 sept 2026) — el founder puede
  // reclasificar un socio como 'vendedor' (equipo de ventas por comisión
  // pura) desde este mismo endpoint de aprobación; el formulario público
  // de /socios sigue siendo solo cpa/influencer/otro a propósito (un
  // vendedor entra por relación directa con Joel, no autoservicio).
  const tipo = body?.tipo;
  if (tipo !== undefined && !["cpa", "influencer", "otro", "vendedor"].includes(tipo)) {
    return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: socio } = await admin
    .from("socios")
    .select("id, nombre, codigo, payment_token, email")
    .eq("id", params.id)
    .maybeSingle();
  if (!socio) return NextResponse.json({ error: "Socio no encontrado." }, { status: 404 });

  const datosActualizar: Record<string, unknown> = { estado, ...(tipo !== undefined ? { tipo } : {}) };

  // Genera el código solo la primera vez que se aprueba (si ya tenía uno de
  // una aprobación anterior — ej. se suspendió y se vuelve a aprobar — se
  // conserva, para no romper links que ya haya compartido antes). El
  // payment_token (migración 0071) ya existe desde que se creó la
  // solicitud (columna con DEFAULT gen_random_uuid()) — no hace falta
  // generarlo aquí, solo devolverlo, porque el link de pago no funciona
  // hasta que el socio esté aprobado (ver app/api/socios/pago/[token]/route.ts).
  if (estado === "aprobado") {
    datosActualizar.approved_at = new Date().toISOString();
    if (!socio.codigo) {
      // Reintenta si por mala suerte el código generado ya existe (poco
      // probable con el sufijo aleatorio, pero es una columna UNIQUE).
      for (let intento = 0; intento < 5; intento++) {
        const codigo = generarCodigo(socio.nombre);
        const { error } = await admin.from("socios").update({ ...datosActualizar, codigo }).eq("id", params.id);
        if (!error) {
          if (socio.email) {
            sendSocioAprobadoEmail({ toEmail: socio.email, toName: socio.nombre, codigo }).catch(() => {});
          }
          return NextResponse.json({ ok: true, codigo, paymentToken: socio.payment_token });
        }
      }
      return NextResponse.json({ error: "No se pudo generar un código único, intenta de nuevo." }, { status: 500 });
    }
  }

  const { error } = await admin.from("socios").update(datosActualizar).eq("id", params.id);
  if (error) return NextResponse.json({ error: "No se pudo actualizar el socio." }, { status: 500 });

  // Si ya tenía código (reaprobación tras suspensión), también le mandamos
  // el correo con su QR — puede que lo haya perdido o nunca lo haya
  // guardado la primera vez.
  if (estado === "aprobado" && socio.codigo && socio.email) {
    sendSocioAprobadoEmail({ toEmail: socio.email, toName: socio.nombre, codigo: socio.codigo }).catch(() => {});
  }

  return NextResponse.json({ ok: true, codigo: socio.codigo, paymentToken: socio.payment_token });
}
