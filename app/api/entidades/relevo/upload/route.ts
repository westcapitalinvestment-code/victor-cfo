import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2, borrarArchivoR2 } from "@/lib/r2";

// Sube el Certificado de Relevo (PDF) de una entidad a R2 y guarda su key en
// business_entities.relevo_certificate_r2_key — mismo patrón que el logo,
// pero solo PDF.
const TAMANO_MAX_BYTES = 5 * 1024 * 1024;

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
    return NextResponse.json({ error: "El archivo pesa más de 5MB — usa uno más pequeño." }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Solo se acepta PDF." }, { status: 400 });
  }

  const { data: entidad, error: fetchError } = await supabase
    .from("business_entities")
    .select("id, relevo_certificate_r2_key")
    .eq("id", entityId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !entidad) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }

  const key = `relevo/${user.id}/${entityId}-${randomUUID()}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await subirArchivoR2(key, buffer, file.type);
  } catch (err) {
    console.error("Error subiendo certificado de relevo a R2:", err);
    return NextResponse.json({ error: "No se pudo subir el archivo. Intenta de nuevo." }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("business_entities")
    .update({ relevo_certificate_r2_key: key })
    .eq("id", entityId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (entidad.relevo_certificate_r2_key) {
    try {
      await borrarArchivoR2(entidad.relevo_certificate_r2_key);
    } catch (err) {
      console.error("Error borrando certificado de relevo viejo de R2:", err);
    }
  }

  return NextResponse.json({ ok: true, key });
}
