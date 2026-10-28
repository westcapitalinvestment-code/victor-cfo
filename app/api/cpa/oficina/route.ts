import { NextRequest, NextResponse } from "next/server";
import { contableAutenticado, fichaDelContable, fusionarPorTelefono } from "@/lib/oficina-contable-server";
import { createClient } from "@/lib/supabase/server";
import { esCuentaDemo } from "@/lib/demo";
import {
  ESPECIALIDADES,
  MUNICIPIOS_PR,
  SECTORES,
  limpiarListaLibre,
  limpiarSocial,
  normalizarNombre,
  normalizarTelefono,
  perfilCompleto,
} from "@/lib/oficinas-contables";

// Perfil público de la oficina del contable (migración 0163). Es lo que ven
// los clientes de VICTOR en el directorio de contables.

function aRespuesta(o: Record<string, unknown>) {
  const especialidades = (o.especialidades as string[]) ?? [];
  return {
    id: o.id as string,
    nombre: o.nombre as string,
    contactoNombre: (o.contacto_nombre as string | null) ?? "",
    email: (o.email as string | null) ?? "",
    telefono: (o.telefono as string | null) ?? "",
    pueblo: (o.pueblo as string | null) ?? "",
    web: (o.web as string | null) ?? "",
    instagram: (o.instagram as string | null) ?? "",
    facebook: (o.facebook as string | null) ?? "",
    sectores: (o.sectores as string[]) ?? [],
    especialidades,
    remoto: !!o.remoto,
    descripcion: (o.descripcion as string | null) ?? "",
    publicar: o.publicar !== false,
    completo: perfilCompleto({
      pueblo: (o.pueblo as string | null) ?? null,
      especialidades,
      descripcion: (o.descripcion as string | null) ?? null,
    }),
    // Si el vendedor ya escribió una descripción, se le sugiere al contable como punto de partida.
    sugerencia: (o.descripcion_vendedor as string | null) ?? "",
  };
}

export async function GET() {
  const ctx = await contableAutenticado();
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const ficha = await fichaDelContable(ctx);
  if (!ficha) return NextResponse.json({ error: "No se pudo cargar tu perfil." }, { status: 500 });
  return NextResponse.json({ ok: true, oficina: aRespuesta(ficha) });
}

export async function PUT(req: NextRequest) {
  const ctx = await contableAutenticado();
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  // Cuenta demo del CPA: no se publica nada en el directorio real.
  const sb = createClient();
  const {
    data: { user: usuarioDemo },
  } = await sb.auth.getUser();
  if (usuarioDemo && (await esCuentaDemo(sb, usuarioDemo.id))) {
    return NextResponse.json({ ok: true, demo: true });
  }
  const ficha = await fichaDelContable(ctx);
  if (!ficha) return NextResponse.json({ error: "No se pudo cargar tu perfil." }, { status: 500 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const nombre = typeof body.nombre === "string" ? body.nombre.trim().slice(0, 140) : "";
  if (nombre.length < 2) return NextResponse.json({ error: "Escribe el nombre de tu oficina." }, { status: 400 });
  const pueblo = typeof body.pueblo === "string" && (MUNICIPIOS_PR as readonly string[]).includes(body.pueblo) ? body.pueblo : null;
  const telRaw = typeof body.telefono === "string" ? body.telefono.trim() : "";
  const telefono = telRaw ? normalizarTelefono(telRaw) : null;
  if (telRaw && !telefono) return NextResponse.json({ error: "El teléfono debe tener 10 dígitos." }, { status: 400 });

  const upd = {
    nombre,
    nombre_norm: normalizarNombre(nombre) || "oficina",
    contacto_nombre: typeof body.contactoNombre === "string" ? body.contactoNombre.trim().slice(0, 120) || null : null,
    telefono,
    pueblo,
    web: limpiarSocial(body.web),
    instagram: limpiarSocial(body.instagram),
    facebook: limpiarSocial(body.facebook),
    sectores: limpiarListaLibre(body.sectores, SECTORES),
    especialidades: limpiarListaLibre(body.especialidades, ESPECIALIDADES),
    remoto: body.remoto === true,
    descripcion: typeof body.descripcion === "string" ? body.descripcion.trim().slice(0, 400) || null : null,
    publicar: body.publicar !== false,
    updated_at: new Date().toISOString(),
  };

  // Si el teléfono ya estaba en una ficha creada por un vendedor, se unen (sin duplicar).
  if (telefono && telefono !== ficha.telefono) await fusionarPorTelefono(ctx.admin, ficha, telefono);

  const { data, error } = await ctx.admin.from("oficinas_contables").update(upd).eq("id", ficha.id).select("*").maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Ese teléfono ya pertenece a otra oficina." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, oficina: data ? aRespuesta(data) : null });
}
