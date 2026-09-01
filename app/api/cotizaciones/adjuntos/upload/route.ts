import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2 } from "@/lib/r2";

// Sube UN archivo adjunto de una cotización a Cloudflare R2 y crea su fila
// en cotizacion_attachments — calcado de /api/facturas/adjuntos/upload.
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
  const cotizacionId = formData.get("cotizacionId");

  if (!(file instanceof File) || typeof cotizacionId !== "string" || !cotizacionId) {
    return NextResponse.json({ error: "Falta el archivo o el id de la cotización." }, { status: 400 });
  }

  if (file.size > TAMANO_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo pesa más de 15MB — usa uno más pequeño." }, { status: 400 });
  }

  const { data: cotizacion, error: fetchError } = await supabase
    .from("cotizaciones")
    .select("id")
    .eq("id", cotizacionId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !cotizacion) {
    return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const key = `cotizaciones/${user.id}/${cotizacionId}-${randomUUID()}.${extension}`;
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
    .from("cotizacion_attachments")
    .insert({
      cotizacion_id: cotizacionId,
      owner_id: user.id,
      nombre_archivo: file.name,
      tipo: file.type || null,
      r2_key: key,
      tamano_bytes: file.size,
    })
    .select("id")
    .single();

  if (insertError || !nuevoArchivo) {
    return NextResponse.json({ error: insertError?.message ?? "No se pudo guardar el archivo." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: nuevoArchivo.id });
}
