import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2 } from "@/lib/r2";

// Sube UN archivo de la Bóveda a Cloudflare R2 y crea su fila en
// document_files (owner_id, document_id, r2_key, etiqueta opcional). Se
// llama una vez por cada foto/PDF que el usuario adjunte — un documento
// puede tener 0, 1 o varios archivos (ej. frente/atrás de una licencia,
// varias páginas de un contrato), cada uno con su propia etiqueta para
// distinguirlos.
//
// Límite defensivo de 15MB — de sobra para una foto de cámara o un PDF de
// pocas páginas.
const TAMANO_MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const documentId = formData.get("documentId");
  const etiquetaRaw = formData.get("etiqueta");
  const etiqueta = typeof etiquetaRaw === "string" && etiquetaRaw.trim() ? etiquetaRaw.trim() : null;

  if (!(file instanceof File) || typeof documentId !== "string" || !documentId) {
    return NextResponse.json({ error: "Falta el archivo o el id del documento." }, { status: 400 });
  }

  if (file.size > TAMANO_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo pesa más de 15MB — usa uno más pequeño." }, { status: 400 });
  }

  // Confirma que el documento existe y que quien llama tiene acceso —
  // SIN forzar owner_id = user.id, porque un admin/secretaria nivel
  // Administrador (migración 0056) puede subir documentos a la Bóveda del
  // DUEÑO, con su propio user.id distinto al owner_id real. RLS ya decide
  // si esta fila es visible (dueño o admin autorizado) — aquí solo se lee
  // el owner_id VERDADERO del documento para guardar el archivo bajo el
  // mismo dueño, nunca bajo el user.id de quien subió.
  const { data: doc, error: fetchError } = await supabase.from("documents").select("id, owner_id").eq("id", documentId).single();

  if (fetchError || !doc) {
    return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const key = `documentos/${doc.owner_id}/${documentId}-${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await subirArchivoR2(key, buffer, file.type || "application/octet-stream");
  } catch (err) {
    console.error("Error subiendo a R2:", err);
    return NextResponse.json(
      { error: "No se pudo subir el archivo. Revisa que Cloudflare R2 esté configurado e intenta de nuevo." },
      { status: 500 }
    );
  }

  const { data: nuevoArchivo, error: insertError } = await supabase
    .from("document_files")
    .insert({ document_id: documentId, owner_id: doc.owner_id, r2_key: key, etiqueta })
    .select("id")
    .single();

  if (insertError || !nuevoArchivo) {
    return NextResponse.json({ error: insertError?.message ?? "No se pudo guardar el archivo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: nuevoArchivo.id });
}
