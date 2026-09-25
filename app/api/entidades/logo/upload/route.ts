import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2, borrarArchivoR2 } from "@/lib/r2";

// Sube el logo de una entidad de negocio a R2 y guarda su key en
// business_entities.logo_r2_key — mismo patrón que /api/documentos/upload,
// pero de un solo archivo (reemplaza el anterior si ya había uno).
const TAMANO_MAX_BYTES = 5 * 1024 * 1024;
// Aceptamos PNG/JPG/WEBP y los normalizamos todos a un PNG limpio con
// sharp antes de guardarlos (ver abajo). Antes se guardaba el archivo tal
// cual llegaba, y algunos JPG (progresivos, CMYK, etc.) se subían bien y
// se veían en la vista previa (el navegador los decodifica sin problema),
// pero pdf-lib no podía incrustarlos al generar la factura — fallaba en
// silencio y el logo simplemente no aparecía en el PDF. Normalizar todo a
// PNG aquí resuelve la causa raíz para cualquier logo, de cualquier
// usuario, de una vez.
const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

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
  const entityId = formData.get("entityId");

  if (!(file instanceof File) || typeof entityId !== "string" || !entityId) {
    return NextResponse.json({ error: "Falta el archivo o el id de la entidad." }, { status: 400 });
  }

  if (file.size > TAMANO_MAX_BYTES) {
    return NextResponse.json({ error: "El logo pesa más de 5MB — usa uno más pequeño." }, { status: 400 });
  }

  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    return NextResponse.json({ error: "Solo se aceptan imágenes PNG, JPG o WEBP." }, { status: 400 });
  }

  // Normaliza a un PNG limpio (fondo transparente preservado) — así
  // garantizamos que pdf-lib SIEMPRE pueda incrustarlo en la factura,
  // sin importar cómo venía codificada la imagen original.
  let bufferPng: Buffer;
  try {
    bufferPng = await sharp(Buffer.from(await file.arrayBuffer()))
      .png()
      .toBuffer();
  } catch (err) {
    console.error("Error normalizando el logo a PNG:", err);
    return NextResponse.json(
      { error: "Esa imagen no se pudo procesar. Prueba con otro archivo (PNG o JPG)." },
      { status: 400 }
    );
  }

  const { data: entidad, error: fetchError } = await supabase
    .from("business_entities")
    .select("id, logo_r2_key")
    .eq("id", entityId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !entidad) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }

  // Siempre .png, porque ya normalizamos arriba con sharp.
  const key = `logos/${user.id}/${entityId}-${randomUUID()}.png`;

  try {
    await subirArchivoR2(key, bufferPng, "image/png");
  } catch (err) {
    console.error("Error subiendo logo a R2:", err);
    return NextResponse.json({ error: "No se pudo subir el logo. Intenta de nuevo." }, { status: 500 });
  }

  const { error: updateError } = await supabase.from("business_entities").update({ logo_r2_key: key }).eq("id", entityId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Borra el logo viejo de R2 (si había uno) — ya no hace falta.
  if (entidad.logo_r2_key) {
    try {
      await borrarArchivoR2(entidad.logo_r2_key);
    } catch (err) {
      console.error("Error borrando logo viejo de R2:", err);
    }
  }

  return NextResponse.json({ ok: true, key });
}
