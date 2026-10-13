import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { subirArchivoR2, borrarArchivoR2 } from "@/lib/r2";
import { sendSocioSolicitudRecibidaEmail, sendSocioNuevaSolicitudAJoelEmail } from "@/lib/email";

// Aplicación pública al Programa de Socios (5 sept 2026) — sin sesión, la
// llama /app/socios/page.tsx. Nace siempre en estado='pendiente' y sin
// código — Joel revisa a mano desde Ventas antes de que nadie pueda
// compartir un link real (ver PATCH en app/api/socios/[id]/route.ts, que es
// quien genera el código al aprobar).
//
// 13 oct 2026 (pedido de Joel): ahora viaja como multipart/form-data para
// poder adjuntar el currículum (PDF/Word, máx. 4 MB — el límite de body de
// las funciones de Vercel es ~4.5 MB). El archivo va a R2 (bucket privado) y
// solo el founder puede verlo (ver app/api/socios/[id]/resume/route.ts).
// Al recibir la solicitud se manda un correo de confirmación al candidato
// con los próximos pasos y un aviso a info@victorcfo.com.
const TAMANO_MAX_BYTES = 4 * 1024 * 1024;
const EXTENSIONES_PERMITIDAS = ["pdf", "doc", "docx"];

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const texto = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };

  const nombre = texto("nombre");
  const email = texto("email").toLowerCase();
  const telefono = texto("telefono") || null;
  const tipoRaw = texto("tipo");
  const tipo = tipoRaw === "cpa" || tipoRaw === "influencer" ? tipoRaw : "otro";
  const comoPromociona = texto("comoPromociona") || null;
  const aceptaTerminos = texto("aceptaTerminos") === "true";
  const archivo = form.get("resume");

  if (!nombre || !email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Falta tu nombre o un email válido." }, { status: 400 });
  }
  // Este programa es una relación de contratista independiente pagada en
  // efectivo real (ver app/socios/terminos/page.tsx) — a diferencia del
  // referido peer-to-peer, necesita su propia aceptación explícita, nunca
  // asumida.
  if (!aceptaTerminos) {
    return NextResponse.json({ error: "Tienes que aceptar los Términos del Programa de Socios." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Anti-duplicados: si ya hay una solicitud pendiente con este email, no se
  // crea otra (evita spam y filas repetidas si el candidato envía dos veces).
  const { data: existente } = await admin
    .from("socios")
    .select("id")
    .ilike("email", email)
    .in("estado", ["pendiente", "aprobado"])
    .limit(1)
    .maybeSingle();
  if (existente) {
    return NextResponse.json(
      { error: "Ya recibimos una solicitud con este email. Si necesitas actualizarla, escríbenos a info@victorcfo.com." },
      { status: 409 }
    );
  }

  let resumeKey: string | null = null;
  let resumeFilename: string | null = null;
  if (archivo instanceof File && archivo.size > 0) {
    const extension = (archivo.name.split(".").pop() || "").toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.includes(extension)) {
      return NextResponse.json({ error: "El currículum debe ser PDF o Word (.doc, .docx)." }, { status: 400 });
    }
    if (archivo.size > TAMANO_MAX_BYTES) {
      return NextResponse.json({ error: "El currículum pesa más de 4 MB — usa un archivo más liviano." }, { status: 400 });
    }
    resumeKey = `socios/resumes/${randomUUID()}.${extension}`;
    resumeFilename = archivo.name.slice(0, 120);
    try {
      await subirArchivoR2(resumeKey, Buffer.from(await archivo.arrayBuffer()), archivo.type || "application/octet-stream");
    } catch (err) {
      console.error("Error subiendo currículum de socio a R2:", err);
      return NextResponse.json({ error: "No se pudo subir tu currículum. Intenta de nuevo." }, { status: 500 });
    }
  }

  const { error } = await admin.from("socios").insert({
    nombre,
    email,
    telefono,
    tipo,
    como_promociona: comoPromociona,
    terminos_aceptados_at: new Date().toISOString(),
    resume_key: resumeKey,
    resume_filename: resumeFilename,
  });

  if (error) {
    console.error("Error guardando solicitud de socio:", error);
    if (resumeKey) await borrarArchivoR2(resumeKey).catch(() => {});
    return NextResponse.json({ error: "No se pudo enviar tu solicitud. Intenta de nuevo." }, { status: 500 });
  }

  // Correos best-effort: la solicitud ya quedó guardada, un fallo de email
  // nunca debe devolverle error al candidato.
  sendSocioSolicitudRecibidaEmail({ toEmail: email, toName: nombre }).catch(() => {});
  sendSocioNuevaSolicitudAJoelEmail({
    nombre,
    email,
    telefono,
    tipo,
    comoPromociona,
    tieneResume: !!resumeKey,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
