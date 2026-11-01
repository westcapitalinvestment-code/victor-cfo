import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSesionSocio, COOKIE_SESION_SOCIO } from "@/lib/socio-session";
import { MUNICIPIOS_PR, esEstadoSeguimiento } from "@/lib/oficinas-contables";
import { PASOS_TOTAL, registrarPermisoCorreo } from "@/lib/email-contactos";

// Prospectos del vendedor (migración 0150, 13 oct 2026). El vendedor registra
// a quien le presentó VICTOR (email y/o teléfono); si esa persona se registra
// después, por cualquier vía y dentro de 60 días, la comisión es suya. Ver la
// lógica de atribución en atribuir_prospecto_a_usuario() (SQL).
//
// Reglas aquí (en la API, no solo en SQL, para dar mensajes claros):
//   - Hace falta nombre + al menos email o teléfono.
//   - No se puede registrar a alguien que ya es usuario de VICTOR.
//   - Un contacto solo puede estar vigente con UN vendedor (gana el primero).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mismo criterio que public.normalizar_telefono() — 10 dígitos, sin el 1 inicial.
function normalizarTelefono(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

// Estado del permiso de correo que ve el vendedor:
//   null = no dio permiso; "activo" = recibirá/está recibiendo la serie;
//   "completo" = ya recibió los 3; "baja" = pidió no recibir más (no se puede revertir).
function estadoCorreo(c?: { baja_at: string | null; paso: number; detenido_razon: string | null }): "activo" | "completo" | "baja" | null {
  if (!c) return null;
  if (c.baja_at) return c.detenido_razon === "permiso_retirado" ? null : "baja";
  if (c.detenido_razon) return "baja";
  return c.paso >= PASOS_TOTAL ? "completo" : "activo";
}

async function socioDeSesion(req: NextRequest) {
  const socioId = verificarSesionSocio(req.cookies.get(COOKIE_SESION_SOCIO)?.value);
  if (!socioId) return null;
  const admin = createAdminClient();
  const { data: socio } = await admin.from("socios").select("id, tipo, estado").eq("id", socioId).maybeSingle();
  if (!socio || socio.tipo !== "vendedor" || socio.estado !== "aprobado") return null;
  return { admin, socioId };
}

export async function GET(req: NextRequest) {
  const ctx = await socioDeSesion(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { admin, socioId } = ctx;

  await admin.rpc("vencer_prospectos");

  const { data, error } = await admin
    .from("socios_prospectos")
    .select("id, nombre, email, telefono, notas, estado, seguimiento, pueblo, seguimiento_at, expira_at, created_at, convertido_at")
    .eq("socio_id", socioId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: "No se pudieron cargar tus prospectos." }, { status: 500 });

  // 0197: ¿dio permiso para recibir correos? (activo = permiso y sin baja)
  const emails = (data ?? []).map((p) => p.email as string | null).filter((e): e is string => !!e);
  const { data: contactos } = emails.length
    ? await admin.from("socios_contactos_correo").select("email, baja_at, paso, detenido_razon").in("email", emails)
    : { data: [] as { email: string; baja_at: string | null; paso: number; detenido_razon: string | null }[] };
  const correoPor = new Map((contactos ?? []).map((c) => [String(c.email).toLowerCase(), c]));

  const ahora = Date.now();
  const prospectos = (data ?? []).map((p) => ({
    id: p.id as string,
    nombre: p.nombre as string,
    email: (p.email as string | null) ?? null,
    telefono: (p.telefono as string | null) ?? null,
    notas: (p.notas as string | null) ?? null,
    // "otro_vendedor" se muestra neutral al vendedor: no se revela quién fue.
    estado: p.estado as "vigente" | "convertido" | "vencido" | "otro_vendedor",
    // 0163: estado de seguimiento del vendedor (pendiente, visitado, ...).
    seguimiento: (p.seguimiento as string) || "pendiente",
    pueblo: (p.pueblo as string | null) ?? null,
    diasRestantes:
      p.estado === "vigente" ? Math.max(0, Math.ceil((new Date(p.expira_at as string).getTime() - ahora) / 86400000)) : null,
    creadoEn: p.created_at as string,
    convertidoEn: (p.convertido_at as string | null) ?? null,
    permisoCorreo: estadoCorreo(correoPor.get(String(p.email || "").toLowerCase())),
  }));

  return NextResponse.json({ ok: true, prospectos });
}

export async function POST(req: NextRequest) {
  const ctx = await socioDeSesion(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { admin, socioId } = ctx;

  const body = await req.json().catch(() => null);
  const nombre = typeof body?.nombre === "string" ? body.nombre.trim().slice(0, 120) : "";
  const emailRaw = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const telefonoRaw = typeof body?.telefono === "string" ? body.telefono.trim() : "";
  const notas = typeof body?.notas === "string" ? body.notas.trim().slice(0, 500) : "";
  const seguimiento = esEstadoSeguimiento(body?.seguimiento) ? body.seguimiento : "pendiente";
  const pueblo =
    typeof body?.pueblo === "string" && (MUNICIPIOS_PR as readonly string[]).includes(body.pueblo) ? body.pueblo : null;

  if (nombre.length < 2) {
    return NextResponse.json({ error: "Escribe el nombre del prospecto." }, { status: 400 });
  }
  if (!emailRaw && !telefonoRaw) {
    return NextResponse.json({ error: "Pon al menos un email o un teléfono." }, { status: 400 });
  }
  if (emailRaw && !EMAIL_RE.test(emailRaw)) {
    return NextResponse.json({ error: "Ese email no parece válido." }, { status: 400 });
  }
  const telefono = telefonoRaw ? normalizarTelefono(telefonoRaw) : null;
  if (telefonoRaw && !telefono) {
    return NextResponse.json({ error: "El teléfono debe tener 10 dígitos (ej. 787-555-1234)." }, { status: 400 });
  }
  const email = emailRaw || null;

  // Libera el cupo de los que ya vencieron antes de comparar.
  await admin.rpc("vencer_prospectos");

  // 1) Ya es usuario → no se puede reclamar retroactivamente.
  if (email) {
    const { data: u } = await admin.from("users").select("id").ilike("email", email).limit(1).maybeSingle();
    if (u) {
      return NextResponse.json(
        { error: "Esta persona ya tiene cuenta en VICTOR, así que no se puede registrar como prospecto." },
        { status: 409 }
      );
    }
  }
  if (telefono) {
    const { data: u } = await admin.from("users").select("id").eq("telefono_registro", telefono).limit(1).maybeSingle();
    if (u) {
      return NextResponse.json(
        { error: "Esta persona ya tiene cuenta en VICTOR, así que no se puede registrar como prospecto." },
        { status: 409 }
      );
    }
  }

  // 2) Ya está vigente (con este vendedor o con otro).
  // Dos consultas separadas (en vez de un .or() armado a mano) para que un
  // email con comas/paréntesis nunca pueda alterar el filtro de PostgREST.
  const [porEmail, porTelefono] = await Promise.all([
    email
      ? admin.from("socios_prospectos").select("id, socio_id").eq("estado", "vigente").eq("email", email).limit(5)
      : Promise.resolve({ data: [] as { id: string; socio_id: string }[] }),
    telefono
      ? admin.from("socios_prospectos").select("id, socio_id").eq("estado", "vigente").eq("telefono", telefono).limit(5)
      : Promise.resolve({ data: [] as { id: string; socio_id: string }[] }),
  ]);
  const existentes = [...(porEmail.data ?? []), ...(porTelefono.data ?? [])];

  if (existentes.length > 0) {
    const mio = existentes.find((e) => e.socio_id === socioId);
    if (mio) {
      return NextResponse.json({ error: "Ya tienes a este prospecto registrado y vigente." }, { status: 409 });
    }
    return NextResponse.json(
      { error: "Este contacto ya fue registrado por otro vendedor y sigue vigente." },
      { status: 409 }
    );
  }

  const { data: nuevo, error } = await admin
    .from("socios_prospectos")
    .insert({ socio_id: socioId, nombre, email, telefono, notas: notas || null, seguimiento, pueblo })
    .select("id")
    .single();

  if (error) {
    // 23505 = carrera con otro vendedor (índice único parcial de vigentes).
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Este contacto ya fue registrado por otro vendedor." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar el prospecto." }, { status: 500 });
  }

  // 0197: el vendedor marcó que la persona dio permiso para recibir correos.
  if (body?.permisoCorreo === true && email) {
    await registrarPermisoCorreo(admin, { permiso: true, email, nombre, tipo: "negocio", socioId, origen: "prospecto", refId: nuevo.id });
  }

  return NextResponse.json({ ok: true, id: nuevo.id });
}

// Cambiar el estado de seguimiento / nota / pueblo de un prospecto propio
// (0163). Funciona en cualquier estado de protección (también vencidos).
export async function PATCH(req: NextRequest) {
  const ctx = await socioDeSesion(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { admin, socioId } = ctx;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  const upd: Record<string, unknown> = {};
  if (body.seguimiento !== undefined) {
    if (!esEstadoSeguimiento(body.seguimiento)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
    upd.seguimiento = body.seguimiento;
    upd.seguimiento_at = new Date().toISOString();
  }
  if (typeof body.notas === "string") upd.notas = body.notas.trim().slice(0, 500) || null;
  if (body.pueblo !== undefined) {
    if (body.pueblo && !(MUNICIPIOS_PR as readonly string[]).includes(body.pueblo)) {
      return NextResponse.json({ error: "Pueblo inválido." }, { status: 400 });
    }
    upd.pueblo = body.pueblo || null;
  }
  const cambiaPermiso = typeof body.permisoCorreo === "boolean";
  if (Object.keys(upd).length === 0 && !cambiaPermiso) return NextResponse.json({ error: "Nada que cambiar." }, { status: 400 });

  if (Object.keys(upd).length > 0) {
    const { error } = await admin.from("socios_prospectos").update(upd).eq("id", id).eq("socio_id", socioId);
    if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }

  // 0197: dar o retirar el permiso de correo (solo si el prospecto es de este vendedor).
  if (cambiaPermiso) {
    const { data: p } = await admin.from("socios_prospectos").select("id, nombre, email").eq("id", id).eq("socio_id", socioId).maybeSingle();
    if (!p?.email) return NextResponse.json({ error: "Este prospecto no tiene email." }, { status: 400 });
    await registrarPermisoCorreo(admin, { permiso: body.permisoCorreo, email: p.email, nombre: p.nombre, tipo: "negocio", socioId, origen: "prospecto", refId: p.id });
  }
  return NextResponse.json({ ok: true });
}

// Borrar un prospecto vigente (por error de dedo, o porque ya no aplica).
export async function DELETE(req: NextRequest) {
  const ctx = await socioDeSesion(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { admin, socioId } = ctx;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  const { error } = await admin
    .from("socios_prospectos")
    .delete()
    .eq("id", id)
    .eq("socio_id", socioId)
    .eq("estado", "vigente");
  if (error) return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
