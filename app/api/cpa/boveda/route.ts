import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { subirArchivoR2, borrarArchivoR2 } from "@/lib/r2";
import { contablePuedeUsarBoveda, entidadEsDelDueno } from "@/lib/cpa-boveda";
import { notificarOwner } from "@/lib/push";
import { sendDocumentoDeContableEmail } from "@/lib/email";

// Bóveda compartida con el contable (15 oct 2026). El contable lista, sube,
// renueva (nueva fecha de vencimiento + archivo) y borra SUS propios archivos
// en la Bóveda de un cliente. Todo va con service role después de comprobar
// el permiso con contablePuedeUsarBoveda — un contable no tiene RLS de
// escritura sobre documents/document_files.
//
// Al subir/renovar, el dueño recibe push + correo, y las banderas de alerta
// 90/30/7 se reinician para que el ciclo de avisos arranque de cero con la
// nueva fecha (igual que cuando el dueño renueva a mano en /documentos/editar).
const TAMANO_MAX_BYTES = 15 * 1024 * 1024;

function limpiarEntidad(v: string | null | undefined): string | null {
  return v && v !== "null" && v !== "undefined" ? v : null;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const ownerId = req.nextUrl.searchParams.get("ownerId");
  const entityId = limpiarEntidad(req.nextUrl.searchParams.get("entityId"));
  if (!ownerId) return NextResponse.json({ error: "Falta ownerId." }, { status: 400 });

  if (!(await contablePuedeUsarBoveda({ email: user.email, ownerId, entityId }))) {
    return NextResponse.json({ error: "Sin acceso a esta Bóveda." }, { status: 403 });
  }

  const admin = createAdminClient();
  let q = admin
    .from("documents")
    .select("id, nombre, tipo, fecha_vencimiento, estado, subido_por_contable, subido_por_email")
    .eq("owner_id", ownerId)
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });
  q = (entityId ? q.eq("entity_id", entityId) : q.is("entity_id", null)).eq("compartir_contador", true);
  const { data: docs, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (docs ?? []).map((d) => d.id);
  const archivos: Record<string, { id: string; etiqueta: string | null }[]> = {};
  if (ids.length) {
    const { data: files } = await admin
      .from("document_files")
      .select("id, document_id, etiqueta, orden")
      .in("document_id", ids)
      .order("orden", { ascending: true });
    for (const f of files ?? []) {
      (archivos[f.document_id] ??= []).push({ id: f.id, etiqueta: f.etiqueta });
    }
  }

  return NextResponse.json({
    documentos: (docs ?? []).map((d) => ({ ...d, archivos: archivos[d.id] ?? [] })),
    email: user.email,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const form = await req.formData();
  const ownerId = String(form.get("ownerId") ?? "");
  const entityId = limpiarEntidad(String(form.get("entityId") ?? ""));
  const documentId = limpiarEntidad(String(form.get("documentId") ?? ""));
  const nombre = String(form.get("nombre") ?? "").trim();
  const tipo = String(form.get("tipo") ?? "Otro").trim() || "Otro";
  const fechaRaw = String(form.get("fechaVencimiento") ?? "").trim();
  const fechaVencimiento = /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw) ? fechaRaw : null;
  const sinVencimiento = form.get("sinVencimiento") === "1";
  const reemplazar = form.get("reemplazar") === "1";
  const etiquetaRaw = String(form.get("etiqueta") ?? "").trim();
  const etiqueta = etiquetaRaw || null;
  const archivos = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);

  if (!ownerId) return NextResponse.json({ error: "Falta ownerId." }, { status: 400 });
  if (!documentId && !nombre) return NextResponse.json({ error: "Escribe el nombre del documento." }, { status: 400 });
  if (!documentId && archivos.length === 0) {
    return NextResponse.json({ error: "Adjunta al menos un archivo." }, { status: 400 });
  }
  for (const f of archivos) {
    if (f.size > TAMANO_MAX_BYTES) {
      return NextResponse.json({ error: "Un archivo pesa más de 15MB — usa uno más pequeño." }, { status: 400 });
    }
  }

  if (!(await contablePuedeUsarBoveda({ email: user.email, ownerId, entityId }))) {
    return NextResponse.json({ error: "Sin acceso a esta Bóveda." }, { status: 403 });
  }
  if (entityId && !(await entidadEsDelDueno(entityId, ownerId))) {
    return NextResponse.json({ error: "Entidad inválida." }, { status: 400 });
  }

  const admin = createAdminClient();
  let docId = documentId;
  let docNombre = nombre;
  let renovado = false;
  let archivosViejos: { id: string; r2_key: string }[] = [];
  let fechaFinal: string | null = fechaVencimiento;

  if (docId) {
    // Editar / renovar un documento existente (del dueño o de un contable
    // anterior) — solo si el dueño lo tiene compartido con su contable.
    const { data: doc } = await admin
      .from("documents")
      .select("id, nombre, owner_id, entity_id, compartir_contador")
      .eq("id", docId)
      .maybeSingle();
    const mismoAlcance = doc && doc.owner_id === ownerId && (doc.entity_id ?? null) === entityId;
    if (!doc || !mismoAlcance || doc.compartir_contador !== true) {
      return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    }
    docNombre = nombre || doc.nombre;
    renovado = true;

    if (reemplazar && archivos.length > 0) {
      const { data: viejos } = await admin.from("document_files").select("id, r2_key").eq("document_id", docId);
      archivosViejos = viejos ?? [];
    }

    const cambios: Record<string, unknown> = { estado: "activo", ultimo_editor_email: user.email };
    if (nombre) cambios.nombre = nombre;
    if (form.get("tipo")) cambios.tipo = tipo;
    if (sinVencimiento) {
      cambios.fecha_vencimiento = null;
      fechaFinal = null;
    } else if (fechaVencimiento) {
      Object.assign(cambios, { fecha_vencimiento: fechaVencimiento, alerta_90: false, alerta_30: false, alerta_7: false });
    }
    if (archivos.length > 0) {
      cambios.subido_por_contable = true;
      cambios.subido_por_email = user.email;
    }
    const { error: updErr } = await admin.from("documents").update(cambios).eq("id", docId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  } else {
    const { data: nuevo, error: insErr } = await admin
      .from("documents")
      .insert({
        owner_id: ownerId,
        entity_id: entityId,
        nombre,
        tipo,
        fecha_vencimiento: sinVencimiento ? null : fechaVencimiento,
        estado: "activo",
        compartir_contador: true,
        subido_por_contable: true,
        subido_por_email: user.email,
        ultimo_editor_email: user.email,
      })
      .select("id")
      .single();
    if (insErr || !nuevo) return NextResponse.json({ error: insErr?.message ?? "No se pudo crear el documento." }, { status: 500 });
    docId = nuevo.id;
  }

  for (const file of archivos) {
    const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const key = `documentos/${ownerId}/${docId}-${randomUUID()}.${extension}`;
    try {
      await subirArchivoR2(key, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
    } catch (err) {
      console.error("Error subiendo a R2 (bóveda contable):", err);
      return NextResponse.json({ error: "No se pudo subir un archivo. Intenta de nuevo." }, { status: 500 });
    }
    const { error: fErr } = await admin
      .from("document_files")
      .insert({ document_id: docId, owner_id: ownerId, r2_key: key, etiqueta });
    if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  }

  // "Reemplazar": ya con el archivo nuevo guardado, se quitan los anteriores
  // (mismo documento, mismo campo — el dueño ve siempre una sola entrada).
  for (const v of archivosViejos) {
    try {
      await borrarArchivoR2(v.r2_key);
    } catch (err) {
      console.error("Error borrando archivo viejo de R2:", err);
    }
    await admin.from("document_files").delete().eq("id", v.id);
  }

  // Aviso al dueño (best-effort).
  try {
    const { data: contable } = await admin.from("users").select("full_name").eq("id", user.id).maybeSingle();
    const { data: dueno } = await admin.from("users").select("email").eq("id", ownerId).maybeSingle();
    const quien = contable?.full_name || user.email || "Tu contable";
    const accion = renovado ? "renovó" : "subió";
    await Promise.allSettled([
      notificarOwner(ownerId, {
        title: "Tu contable actualizó tu Bóveda",
        body: `${quien} ${accion} "${docNombre}".`,
        url: entityId ? "/dashboard/negocio/documentos" : "/dashboard/documentos",
      }),
      dueno?.email
        ? sendDocumentoDeContableEmail({
            toEmail: dueno.email,
            contableNombre: quien,
            documentoNombre: docNombre,
            renovado,
            fechaVencimiento: fechaFinal,
          })
        : Promise.resolve(),
    ]);
  } catch {
    // Best-effort.
  }

  return NextResponse.json({ ok: true, id: docId });
}

// Borra UN archivo, solo si lo subió este mismo contable (documento marcado
// subido_por_contable con su correo). Los documentos del dueño no se tocan.
export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const fileId = req.nextUrl.searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "Falta fileId." }, { status: 400 });

  const admin = createAdminClient();
  const { data: archivo } = await admin
    .from("document_files")
    .select("id, r2_key, document_id, owner_id")
    .eq("id", fileId)
    .maybeSingle();
  if (!archivo) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });

  const { data: doc } = await admin
    .from("documents")
    .select("owner_id, entity_id, subido_por_contable, subido_por_email")
    .eq("id", archivo.document_id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

  const permitido = await contablePuedeUsarBoveda({ email: user.email, ownerId: doc.owner_id, entityId: doc.entity_id ?? null });
  const esSuyo =
    doc.subido_por_contable === true && (doc.subido_por_email ?? "").toLowerCase() === (user.email ?? "").toLowerCase();
  if (!permitido || !esSuyo) {
    return NextResponse.json({ error: "Solo puedes borrar archivos que subiste tú." }, { status: 403 });
  }

  // Deja constancia de quién borra (lo lee el trigger de auditoría).
  await admin.from("documents").update({ ultimo_editor_email: user.email }).eq("id", archivo.document_id);
  try {
    await borrarArchivoR2(archivo.r2_key);
  } catch (err) {
    console.error("Error borrando de R2 (bóveda contable):", err);
  }
  await admin.from("document_files").delete().eq("id", fileId);
  return NextResponse.json({ ok: true });
}
