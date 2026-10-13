import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSesionSocio, COOKIE_SESION_SOCIO } from "@/lib/socio-session";

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
    .select("id, nombre, email, telefono, notas, estado, expira_at, created_at, convertido_at")
    .eq("socio_id", socioId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return NextResponse.json({ error: "No se pudieron cargar tus prospectos." }, { status: 500 });

  const ahora = Date.now();
  const prospectos = (data ?? []).map((p) => ({
    id: p.id as string,
    nombre: p.nombre as string,
    email: (p.email as string | null) ?? null,
    telefono: (p.telefono as string | null) ?? null,
    notas: (p.notas as string | null) ?? null,
    // "otro_vendedor" se muestra neutral al vendedor: no se revela quién fue.
    estado: p.estado as "vigente" | "convertido" | "vencido" | "otro_vendedor",
    diasRestantes:
      p.estado === "vigente" ? Math.max(0, Math.ceil((new Date(p.expira_at as string).getTime() - ahora) / 86400000)) : null,
    creadoEn: p.created_at as string,
    convertidoEn: (p.convertido_at as string | null) ?? null,
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
    .insert({ socio_id: socioId, nombre, email, telefono, notas: notas || null })
    .select("id")
    .single();

  if (error) {
    // 23505 = carrera con otro vendedor (índice único parcial de vigentes).
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Este contacto ya fue registrado por otro vendedor." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar el prospecto." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: nuevo.id });
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
