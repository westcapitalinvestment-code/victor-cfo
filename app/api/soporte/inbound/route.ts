import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarFirmaSvix } from "@/lib/webhook-svix";
import { procesarCorreoSoporte } from "@/lib/soporte-agente";
import { notificarFounder } from "@/lib/push";

// Webhook de Resend Inbound (21 sept 2026, pedido de Joel: "crear un
// agente que conteste lo que sea que esté en nuestro manual, ya si es algo
// que no tenemos que lo derive a mi" — el agente es VICTOR, ver
// lib/soporte-agente.ts). Resend manda un evento `email.received` cada vez
// que llega un correo a cualquier dirección de un dominio configurado para
// recibir — el flujo pensado es soporte@victorcfo.com (la dirección que ya
// se le da al cliente en el email de bienvenida y en la landing) recibe la
// pregunta; si VICTOR no la puede contestar con el manual, escala a
// info@victorcfo.com (bandeja aparte de Joel, ver sendEscalacionSoporteEmail
// en lib/email.ts).
//
// 22 sept 2026 — un correo de prueba a soporte@victorcfo.com se quedó sin
// contestar ni escalar: quedó sentado en la bandeja sin que este webhook se
// disparara. Eso apunta a que el DNS de recepción de Resend para
// soporte@victorcfo.com nunca terminó de completarse (o choca con el MX de
// Google Workspace que ya usa ese buzón para correo normal) — pendiente de
// verificar/objetar con Joel, es un tema de DNS, no de este código.
//
// El payload del webhook es SOLO metadata (email_id, from, subject,
// message_id) — el cuerpo real hay que pedirlo aparte a la API de Resend
// (GET /emails/receiving/:id). El SDK instalado en este proyecto
// (resend ^4.4.1) es de antes de que existiera Receiving, así que ese
// segundo paso se hace con fetch() directo a la API REST en vez de un
// método del SDK.
export const runtime = "nodejs";
export const maxDuration = 60;

const RESEND_API_BASE = "https://api.resend.com";

// Nuestras propias direcciones — un correo que llegara "de" alguna de
// estas normalmente sería un rebote o un loop (ej. si algún día se
// reenvía por error la propia respuesta de VICTOR a soporte@), nunca un
// cliente real. Se descarta sin gastar una llamada a Claude.
//
// 22 sept 2026 — el flujo real es soporte@ recibe, escala a info@ (ver
// comentario de arriba). info@victorcfo.com se incluye aquí igual, de
// forma defensiva: si algún día ese buzón también queda conectado a
// Resend Inbound (por ejemplo para que Joel pueda responder tickets desde
// ahí), la propia escalación de VICTOR no se reprocesaría como un correo
// nuevo. La dirección real de envío (RESEND_FROM_EMAIL) se suma también en
// tiempo de ejecución por la misma razón, sea cual sea su valor.
function direccionesPropias(): Set<string> {
  const propias = new Set([
    "soporte@victorcfo.com",
    "noreply@victorcfo.com",
    "notificaciones@victorcfo.com",
    "info@victorcfo.com",
  ]);
  const fromEnv = process.env.RESEND_FROM_EMAIL;
  if (fromEnv) {
    const { email } = parsearRemitente(fromEnv);
    if (email) propias.add(email);
  }
  return propias;
}

function parsearRemitente(from: string): { email: string; nombre: string | null } {
  const match = from.match(/^(.*)<(.+)>$/);
  if (match) {
    const nombre = match[1].trim().replace(/^"|"$/g, "");
    return { email: match[2].trim().toLowerCase(), nombre: nombre || null };
  }
  return { email: from.trim().toLowerCase(), nombre: null };
}

export async function POST(req: NextRequest) {
  const payload = await req.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Sin secreto configurado no hay forma honesta de verificar que esto
    // viene de Resend y no de cualquiera que le pegue a la URL — se
    // rechaza en vez de procesar a ciegas.
    return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET no está configurada." }, { status: 500 });
  }

  const verificacion = verificarFirmaSvix({
    payload,
    svixId: req.headers.get("svix-id"),
    svixTimestamp: req.headers.get("svix-timestamp"),
    svixSignature: req.headers.get("svix-signature"),
    secret,
  });
  if (!verificacion.valido) {
    return NextResponse.json({ error: verificacion.motivo || "Firma inválida." }, { status: 401 });
  }

  const evento = JSON.parse(payload);
  if (evento?.type !== "email.received") {
    // Si en el futuro se activan otros eventos en el mismo webhook
    // (ej. email.bounced), esto simplemente los ignora en vez de fallar.
    return NextResponse.json({ ok: true });
  }

  const emailId = evento?.data?.email_id as string | undefined;
  const fromRaw = evento?.data?.from as string | undefined;
  const subjectRaw = (evento?.data?.subject as string | undefined) || "(sin asunto)";
  const messageId = evento?.data?.message_id as string | undefined;

  if (!emailId || !fromRaw || !messageId) {
    return NextResponse.json({ error: "Payload de email.received incompleto." }, { status: 400 });
  }

  const { email: deEmail, nombre: deNombre } = parsearRemitente(fromRaw);

  const admin = createAdminClient();

  // Dedup — Resend puede reintentar la entrega del webhook si no
  // respondemos rápido o hay un error transitorio; sin esto, un reintento
  // procesaría el mismo correo dos veces (dos respuestas al cliente, o dos
  // escalaciones a Joel por lo mismo).
  const { data: existente } = await admin
    .from("soporte_conversaciones")
    .select("id")
    .eq("resend_email_id", emailId)
    .maybeSingle();
  if (existente) {
    return NextResponse.json({ ok: true, dedup: true });
  }

  if (direccionesPropias().has(deEmail)) {
    await admin.from("soporte_conversaciones").insert({
      de_email: deEmail,
      de_nombre: deNombre,
      asunto: subjectRaw,
      cuerpo: "(descartado — remitente es una dirección propia, posible loop)",
      resend_email_id: emailId,
      respondido: false,
      escalado: false,
    });
    return NextResponse.json({ ok: true, descartado: true });
  }

  // Segundo paso obligatorio — el webhook no trae el cuerpo (ver comentario
  // arriba). RESEND_API_KEY es la misma variable que ya usa lib/email.ts
  // para enviar, así que no hace falta una nueva.
  const apiKey = process.env.RESEND_API_KEY;
  let cuerpo = "";
  if (apiKey) {
    try {
      const res = await fetch(`${RESEND_API_BASE}/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const detalle = await res.json();
        cuerpo = (detalle?.text as string) || (detalle?.html as string) || "";
      }
    } catch {
      // Si falla la descarga del cuerpo, seguimos con cuerpo vacío — mejor
      // escalar a Joel con lo que hay que perder el correo por completo.
    }
  }

  const { data: fila } = await admin
    .from("soporte_conversaciones")
    .insert({
      de_email: deEmail,
      de_nombre: deNombre,
      asunto: subjectRaw,
      cuerpo: cuerpo || "(no se pudo obtener el cuerpo del correo)",
      resend_email_id: emailId,
      respondido: false,
      escalado: false,
    })
    .select("id")
    .single();

  if (!cuerpo) {
    // Sin cuerpo no hay nada confiable que mandarle a Claude — se escala
    // directo en vez de dejar que el agente conteste sobre un correo vacío.
    const { sendEscalacionSoporteEmail } = await import("@/lib/email");
    const envio = await sendEscalacionSoporteEmail({
      deEmail,
      deNombre,
      asunto: subjectRaw,
      cuerpo: "(VICTOR CFO no pudo obtener el cuerpo de este correo desde Resend)",
      motivo: "No se pudo descargar el cuerpo del correo desde la API de Resend.",
    });
    if (fila?.id) {
      await admin
        .from("soporte_conversaciones")
        .update({ escalado: true, error: "No se pudo obtener el cuerpo del correo." })
        .eq("id", fila.id);
    }
    notificarFounder({
      title: "VICTOR CFO — Soporte",
      body: `Correo de ${deNombre || deEmail} sin poder procesarse — revísalo en info@victorcfo.com.`,
      url: "/dashboard/cfo",
    });
    return NextResponse.json({ ok: true, escalado: true, avisoAJoel: envio.sent });
  }

  const resultado = await procesarCorreoSoporte({
    deEmail,
    deNombre,
    asunto: subjectRaw,
    cuerpo,
    messageId,
  });

  if (fila?.id) {
    if (resultado.accion === "respondido") {
      await admin
        .from("soporte_conversaciones")
        .update({
          respondido: true,
          respuesta: resultado.respuesta,
          articulos_usados: resultado.articulosUsados,
        })
        .eq("id", fila.id);
    } else if (resultado.accion === "escalado") {
      await admin
        .from("soporte_conversaciones")
        .update({ escalado: true, respuesta: resultado.motivo })
        .eq("id", fila.id);
      notificarFounder({
        title: "VICTOR CFO — Soporte",
        body: `${deNombre || deEmail} escribió algo que VICTOR no pudo contestar: "${subjectRaw}".`,
        url: "/dashboard/cfo",
      });
    } else {
      await admin.from("soporte_conversaciones").update({ error: resultado.error }).eq("id", fila.id);
    }
  }

  return NextResponse.json({ ok: true, resultado: resultado.accion });
}
