import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2 } from "@/lib/r2";

// Sube el archivo de un documento de la Bóveda a Cloudflare R2 y guarda su
// r2_key en la fila de `documents` correspondiente. Se llama DESPUÉS de
// crear (o al editar) el documento — el formulario ya tiene el id.
//
// Límite defensivo de 15MB — de sobra para una foto de cámara o un PDF de
// pocas páginas. (Vercel de por sí limita el body de una función serverless
// a unos MB según el plan; este chequeo solo da un mensaje claro en vez de
// un 413 crudo si alguien intenta subir algo enorme.)
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

  if (!(file instanceof File) || typeof documentId !== "string" || !documentId) {
    return NextResponse.json({ error: "Falta el archivo o el id del documento." }, { status: 400 });
  }

  if (file.size > TAMANO_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo pesa más de 15MB — usa uno más pequeño." }, { status: 400 });
  }

  // Confirma que el documento existe y es del usuario ANTES de subir a R2
  // — evita gastar el upload si alguien manda un documentId ajeno o
  // inventado.
  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !doc) {
    return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const key = `documentos/${user.id}/${documentId}-${randomUUID()}.${extension}`;
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

  const { error: updateError } = await supabase.from("documents").update({ r2_key: key }).eq("id", documentId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, key });
}
