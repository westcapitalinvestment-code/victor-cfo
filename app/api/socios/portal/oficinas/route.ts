import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSesionSocio, COOKIE_SESION_SOCIO } from "@/lib/socio-session";
import {
  DIAS_PROTECCION_OFICINA,
  ESPECIALIDADES,
  MUNICIPIOS_PR,
  SECTORES,
  esEstadoSeguimiento,
  limpiarLista,
  limpiarSocial,
  normalizarNombre,
  normalizarTelefono,
  type StatusOficina,
} from "@/lib/oficinas-contables";

// Oficinas de contables visitadas por los vendedores (migración 0163,
// 18 oct 2026). Registro COMPARTIDO para no repetir visitas:
//   - El vendedor que registra una oficina es dueño del seguimiento 60 días;
//     cada actualización suya renueva el plazo.
//   - Los demás vendedores ven solo nombre, pueblo y status (nunca quién la
//     visitó, ni contacto, ni notas).
//   - Si el contable ya se registró en el portal ("tiene el portal"), la
//     ficha es suya: el vendedor solo puede editar sus notas internas.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DIA = 86400000;

async function socioDeSesion(req: NextRequest) {
  const socioId = verificarSesionSocio(req.cookies.get(COOKIE_SESION_SOCIO)?.value);
  if (!socioId) return null;
  const admin = createAdminClient();
  const { data: socio } = await admin.from("socios").select("id, tipo, estado").eq("id", socioId).maybeSingle();
  if (!socio || socio.tipo !== "vendedor" || socio.estado !== "aprobado") return null;
  return { admin, socioId };
}

type Fila = {
  id: string;
  nombre: string;
  socio_id: string | null;
  owner_expira_at: string | null;
  estado: string;
  notas_vendedor: string | null;
  descripcion_vendedor: string | null;
  contacto_nombre: string | null;
  email: string | null;
  telefono: string | null;
  pueblo: string | null;
  web: string | null;
  instagram: string | null;
  facebook: string | null;
  sectores: string[];
  especialidades: string[];
  remoto: boolean;
  user_id: string | null;
  created_at: string;
};

const COLS =
  "id, nombre, socio_id, owner_expira_at, estado, notas_vendedor, descripcion_vendedor, contacto_nombre, email, telefono, pueblo, web, instagram, facebook, sectores, especialidades, remoto, user_id, created_at";

function statusDe(f: Fila, ahora: number): StatusOficina {
  if (f.user_id) return "tiene_portal";
  if (f.socio_id && f.owner_expira_at && new Date(f.owner_expira_at).getTime() > ahora) return "en_seguimiento";
  return "disponible";
}

export async function GET(req: NextRequest) {
  const ctx = await socioDeSesion(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { admin, socioId } = ctx;

  await admin.rpc("sincronizar_oficinas_contables");

  // Búsqueda por email o teléfono EXACTO: sirve para saber si una oficina ya
  // está registrada por otro vendedor sin exponer su contacto (solo devuelve
  // nombre, pueblo y status).
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 120);
  let porContacto: { id: string; nombre: string; pueblo: string | null; status: StatusOficina; mia: boolean }[] = [];
  if (q) {
    const tel = q.includes("@") ? null : normalizarTelefono(q);
    const consulta = q.includes("@")
      ? admin.from("oficinas_contables").select(COLS).eq("email", q).limit(3)
      : tel
        ? admin.from("oficinas_contables").select(COLS).eq("telefono", tel).limit(3)
        : null;
    if (consulta) {
      const { data: hallados } = await consulta;
      const ahoraQ = Date.now();
      porContacto = ((hallados ?? []) as Fila[]).map((f) => ({
        id: f.id,
        nombre: f.nombre,
        pueblo: f.pueblo,
        status: statusDe(f, ahoraQ),
        mia: f.socio_id === socioId,
      }));
    }
  }

  const { data, error } = await admin
    .from("oficinas_contables")
    .select(COLS)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) return NextResponse.json({ error: "No se pudo cargar el listado." }, { status: 500 });

  const ahora = Date.now();
  const filas = (data ?? []) as Fila[];

  const mias = filas
    .filter((f) => f.socio_id === socioId)
    .map((f) => {
      const status = statusDe(f, ahora);
      return {
        id: f.id,
        nombre: f.nombre,
        status,
        estado: f.estado,
        contactoNombre: f.contacto_nombre,
        email: f.email,
        telefono: f.telefono,
        pueblo: f.pueblo,
        web: f.web,
        instagram: f.instagram,
        facebook: f.facebook,
        sectores: f.sectores,
        especialidades: f.especialidades,
        remoto: f.remoto,
        descripcion: f.descripcion_vendedor,
        notas: f.notas_vendedor,
        diasRestantes:
          status === "en_seguimiento" && f.owner_expira_at
            ? Math.max(0, Math.ceil((new Date(f.owner_expira_at).getTime() - ahora) / DIA))
            : null,
        creadoEn: f.created_at,
      };
    });

  // Lo de los demás: solo nombre, pueblo y status.
  const otras = filas
    .filter((f) => f.socio_id !== socioId)
    .map((f) => ({ id: f.id, nombre: f.nombre, pueblo: f.pueblo, status: statusDe(f, ahora) }));

  return NextResponse.json({ ok: true, mias, otras, porContacto });
}

function leerCampos(body: Record<string, unknown>) {
  const nombre = typeof body.nombre === "string" ? body.nombre.trim().slice(0, 140) : "";
  const emailRaw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const telRaw = typeof body.telefono === "string" ? body.telefono.trim() : "";
  const pueblo = typeof body.pueblo === "string" && (MUNICIPIOS_PR as readonly string[]).includes(body.pueblo) ? body.pueblo : null;
  return {
    nombre,
    emailRaw,
    telRaw,
    contacto_nombre: typeof body.contactoNombre === "string" ? body.contactoNombre.trim().slice(0, 120) || null : null,
    pueblo,
    web: limpiarSocial(body.web),
    instagram: limpiarSocial(body.instagram),
    facebook: limpiarSocial(body.facebook),
    sectores: limpiarLista(body.sectores, SECTORES),
    especialidades: limpiarLista(body.especialidades, ESPECIALIDADES),
    remoto: body.remoto === true,
    descripcion_vendedor: typeof body.descripcion === "string" ? body.descripcion.trim().slice(0, 400) || null : null,
    notas_vendedor: typeof body.notas === "string" ? body.notas.trim().slice(0, 500) || null : null,
    estado: esEstadoSeguimiento(body.estado) ? body.estado : "visitado",
  };
}

export async function POST(req: NextRequest) {
  const ctx = await socioDeSesion(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { admin, socioId } = ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const c = leerCampos(body);

  if (c.nombre.length < 2) return NextResponse.json({ error: "Escribe el nombre de la oficina." }, { status: 400 });
  if (!c.pueblo) return NextResponse.json({ error: "Escoge el pueblo de la oficina." }, { status: 400 });
  if (c.emailRaw && !EMAIL_RE.test(c.emailRaw)) {
    return NextResponse.json({ error: "Ese email no parece válido." }, { status: 400 });
  }
  const telefono = c.telRaw ? normalizarTelefono(c.telRaw) : null;
  if (c.telRaw && !telefono) {
    return NextResponse.json({ error: "El teléfono debe tener 10 dígitos (ej. 787-555-1234)." }, { status: 400 });
  }
  const email = c.emailRaw || null;
  const nombreNorm = normalizarNombre(c.nombre);
  if (nombreNorm.length < 2) return NextResponse.json({ error: "Escribe un nombre válido." }, { status: 400 });

  await admin.rpc("sincronizar_oficinas_contables");

  // ¿Ya existe? Por email, teléfono o (mismo nombre + mismo pueblo).
  const [porEmail, porTel, porNombre] = await Promise.all([
    email ? admin.from("oficinas_contables").select(COLS).eq("email", email).limit(1) : Promise.resolve({ data: [] }),
    telefono ? admin.from("oficinas_contables").select(COLS).eq("telefono", telefono).limit(1) : Promise.resolve({ data: [] }),
    admin.from("oficinas_contables").select(COLS).eq("nombre_norm", nombreNorm).eq("pueblo", c.pueblo).limit(1),
  ]);
  const existente = ([...(porEmail.data ?? []), ...(porTel.data ?? []), ...(porNombre.data ?? [])] as Fila[])[0];
  const ahora = Date.now();
  const nuevoVence = new Date(ahora + DIAS_PROTECCION_OFICINA * DIA).toISOString();

  if (existente) {
    const status = statusDe(existente, ahora);
    if (existente.socio_id === socioId) {
      return NextResponse.json({ error: "Ya tienes registrada esta oficina." }, { status: 409 });
    }
    if (status === "tiene_portal") {
      return NextResponse.json(
        { error: "Esta oficina ya tiene el portal de VICTOR. No hace falta visitarla.", status },
        { status: 409 }
      );
    }
    if (status === "en_seguimiento") {
      return NextResponse.json(
        { error: "Esta oficina ya fue visitada y otro vendedor le está dando seguimiento.", status },
        { status: 409 }
      );
    }
    // Disponible (seguimiento vencido): la reclama este vendedor.
    const { error: errR } = await admin
      .from("oficinas_contables")
      .update({
        socio_id: socioId,
        owner_expira_at: nuevoVence,
        estado: c.estado,
        notas_vendedor: c.notas_vendedor,
        descripcion_vendedor: c.descripcion_vendedor,
        contacto_nombre: c.contacto_nombre ?? existente.contacto_nombre,
        email: email ?? existente.email,
        telefono: telefono ?? existente.telefono,
        pueblo: c.pueblo,
        web: c.web ?? existente.web,
        instagram: c.instagram ?? existente.instagram,
        facebook: c.facebook ?? existente.facebook,
        sectores: c.sectores.length ? c.sectores : existente.sectores,
        especialidades: c.especialidades.length ? c.especialidades : existente.especialidades,
        remoto: c.remoto,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existente.id);
    if (errR) return NextResponse.json({ error: "No se pudo reclamar la oficina." }, { status: 500 });
    return NextResponse.json({ ok: true, id: existente.id, reclamada: true });
  }

  const { data: nueva, error } = await admin
    .from("oficinas_contables")
    .insert({
      nombre: c.nombre,
      nombre_norm: nombreNorm,
      socio_id: socioId,
      owner_expira_at: nuevoVence,
      estado: c.estado,
      notas_vendedor: c.notas_vendedor,
      descripcion_vendedor: c.descripcion_vendedor,
      contacto_nombre: c.contacto_nombre,
      email,
      telefono,
      pueblo: c.pueblo,
      web: c.web,
      instagram: c.instagram,
      facebook: c.facebook,
      sectores: c.sectores,
      especialidades: c.especialidades,
      remoto: c.remoto,
    })
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Esta oficina ya está registrada (email o teléfono repetido)." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar la oficina." }, { status: 500 });
  }

  // Si el contable ya tenía cuenta, enlaza de una vez para mostrar "tiene el portal".
  await admin.rpc("sincronizar_oficinas_contables");
  return NextResponse.json({ ok: true, id: nueva.id });
}

export async function PATCH(req: NextRequest) {
  const ctx = await socioDeSesion(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { admin, socioId } = ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!body || !id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  const { data: actual } = await admin.from("oficinas_contables").select(COLS).eq("id", id).maybeSingle();
  const f = actual as Fila | null;
  if (!f || f.socio_id !== socioId) return NextResponse.json({ error: "Oficina no encontrada." }, { status: 404 });

  const ahora = Date.now();
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.notas === "string") upd.notas_vendedor = body.notas.trim().slice(0, 500) || null;

  // Con portal, la ficha es del contable: el vendedor solo toca sus notas.
  if (!f.user_id) {
    if (body.estado !== undefined) {
      if (!esEstadoSeguimiento(body.estado)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
      upd.estado = body.estado;
    }
    if (typeof body.nombre === "string") {
      const n = body.nombre.trim().slice(0, 140);
      if (n.length < 2) return NextResponse.json({ error: "Nombre inválido." }, { status: 400 });
      upd.nombre = n;
      upd.nombre_norm = normalizarNombre(n);
    }
    if (body.pueblo !== undefined) {
      if (!(MUNICIPIOS_PR as readonly string[]).includes(body.pueblo as string)) {
        return NextResponse.json({ error: "Pueblo inválido." }, { status: 400 });
      }
      upd.pueblo = body.pueblo;
    }
    if (body.email !== undefined) {
      const e = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (e && !EMAIL_RE.test(e)) return NextResponse.json({ error: "Ese email no parece válido." }, { status: 400 });
      upd.email = e || null;
    }
    if (body.telefono !== undefined) {
      const raw = typeof body.telefono === "string" ? body.telefono.trim() : "";
      const t = raw ? normalizarTelefono(raw) : null;
      if (raw && !t) return NextResponse.json({ error: "El teléfono debe tener 10 dígitos." }, { status: 400 });
      upd.telefono = t;
    }
    if (body.contactoNombre !== undefined && typeof body.contactoNombre === "string") {
      upd.contacto_nombre = body.contactoNombre.trim().slice(0, 120) || null;
    }
    if (body.web !== undefined) upd.web = limpiarSocial(body.web);
    if (body.instagram !== undefined) upd.instagram = limpiarSocial(body.instagram);
    if (body.facebook !== undefined) upd.facebook = limpiarSocial(body.facebook);
    if (body.sectores !== undefined) upd.sectores = limpiarLista(body.sectores, SECTORES);
    if (body.especialidades !== undefined) upd.especialidades = limpiarLista(body.especialidades, ESPECIALIDADES);
    if (body.remoto !== undefined) upd.remoto = body.remoto === true;
    if (typeof body.descripcion === "string") upd.descripcion_vendedor = body.descripcion.trim().slice(0, 400) || null;
    // Cada actualización del dueño renueva los 60 días.
    upd.owner_expira_at = new Date(ahora + DIAS_PROTECCION_OFICINA * DIA).toISOString();
  }

  const { error } = await admin.from("oficinas_contables").update(upd).eq("id", id).eq("socio_id", socioId);
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Ese email o teléfono ya pertenece a otra oficina." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Quitar una oficina propia que aún no tiene portal (error de dedo, etc.).
export async function DELETE(req: NextRequest) {
  const ctx = await socioDeSesion(req);
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { admin, socioId } = ctx;
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  const { error } = await admin
    .from("oficinas_contables")
    .delete()
    .eq("id", id)
    .eq("socio_id", socioId)
    .is("user_id", null);
  if (error) return NextResponse.json({ error: "No se pudo borrar." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
