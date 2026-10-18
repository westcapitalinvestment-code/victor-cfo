import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSolicitudContableEmail } from "@/lib/email";
import { normalizarTelefono } from "@/lib/oficinas-contables";

// Un cliente de VICTOR contacta a un contable del directorio (migración 0163).
// Requiere que el cliente autorice compartir su nombre, correo y teléfono.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const oficinaId = typeof body?.oficinaId === "string" ? body.oficinaId : "";
  const mensaje = typeof body?.mensaje === "string" ? body.mensaje.trim().slice(0, 600) : "";
  const telRaw = typeof body?.telefono === "string" ? body.telefono.trim() : "";
  if (!oficinaId) return NextResponse.json({ error: "Falta la oficina." }, { status: 400 });
  if (body?.autorizo !== true) {
    return NextResponse.json({ error: "Debes autorizar compartir tus datos con el contable." }, { status: 400 });
  }
  const telefono = telRaw ? normalizarTelefono(telRaw) : null;
  if (telRaw && !telefono) return NextResponse.json({ error: "El teléfono debe tener 10 dígitos." }, { status: 400 });

  const admin = createAdminClient();

  const { data: oficina } = await admin
    .from("oficinas_contables")
    .select("id, nombre, email, user_id, publicar")
    .eq("id", oficinaId)
    .maybeSingle();
  if (!oficina || !oficina.user_id || !oficina.publicar) {
    return NextResponse.json({ error: "Esa oficina no está disponible." }, { status: 404 });
  }

  // Límites: una solicitud por oficina cada 7 días, y 10 por día en total.
  const hace7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const hace1 = new Date(Date.now() - 86400000).toISOString();
  const [{ count: repetida }, { count: delDia }] = await Promise.all([
    admin.from("contable_solicitudes").select("id", { count: "exact", head: true }).eq("cliente_id", user.id).eq("oficina_id", oficinaId).gte("created_at", hace7),
    admin.from("contable_solicitudes").select("id", { count: "exact", head: true }).eq("cliente_id", user.id).gte("created_at", hace1),
  ]);
  if ((repetida ?? 0) > 0) {
    return NextResponse.json({ error: "Ya contactaste a esta oficina esta semana. Espera su respuesta." }, { status: 429 });
  }
  if ((delDia ?? 0) >= 10) {
    return NextResponse.json({ error: "Llegaste al límite de solicitudes por hoy." }, { status: 429 });
  }

  const { data: perfil } = await admin.from("users").select("full_name, email").eq("id", user.id).maybeSingle();
  const nombreCliente = (perfil?.full_name as string | null) || user.email.split("@")[0];

  // Correo de la oficina: el de la ficha, o el de la cuenta del contable.
  let destino = (oficina.email as string | null) || null;
  if (!destino) {
    const { data: cu } = await admin.from("users").select("email").eq("id", oficina.user_id).maybeSingle();
    destino = (cu?.email as string | null) || null;
  }
  if (!destino) return NextResponse.json({ error: "No se pudo contactar a esta oficina ahora." }, { status: 500 });

  const { error } = await admin.from("contable_solicitudes").insert({
    oficina_id: oficinaId,
    cliente_id: user.id,
    nombre_cliente: nombreCliente,
    email_cliente: user.email,
    telefono_cliente: telefono,
    mensaje: mensaje || null,
    autorizo_compartir: true,
  });
  if (error) return NextResponse.json({ error: "No se pudo enviar la solicitud." }, { status: 500 });

  const envio = await sendSolicitudContableEmail({
    toEmail: destino,
    oficina: oficina.nombre as string,
    clienteNombre: nombreCliente,
    clienteEmail: user.email,
    clienteTelefono: telefono,
    mensaje: mensaje || null,
  });

  return NextResponse.json({ ok: true, emailSent: envio.sent });
}
