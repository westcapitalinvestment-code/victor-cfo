import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2, borrarArchivoR2 } from "@/lib/r2";

// Sube el logo de una entidad de negocio a R2 y guarda su key en
// business_entities.logo_r2_key — mismo patrón que /api/documentos/upload,
// pero de un solo archivo (reemplaza el anterior si ya había uno).
const TAMANO_MAX_BYTES = 5 * 1024 * 1024;
// Solo PNG/JPG — pdf-lib (la librería que arma el PDF) no puede incrustar
// WEBP, así que no lo aceptamos aquí para no tener un logo que se sube
// bien pero luego no aparece en la factura.
const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/jpg"];

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

  const { data: entidad, error: fetchError } = await supabase
    .from("business_entities")
    .select("id, logo_r2_key")
    .eq("id", entityId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !entidad) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }

  const extension = file.type === "image/png" ? "png" : "jpg";
  const key = `logos/${user.id}/${entityId}-${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await subirArchivoR2(key, buffer, file.type);
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
