import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2, borrarArchivoR2 } from "@/lib/r2";

// Sube el Certificado de Registro de Comerciante (PDF) de UN CONTRATISTA a
// R2 — mismo patrón exacto que /api/pagos/vendors/relevo/upload (30 sept
// 2026, #788, pedido de Joel a raíz de la conversación con su CPA: junto
// con el tax_id y el Relevo, este documento completa el expediente digital
// que respalda ante una auditoría de reclasificación que el contratista
// opera un negocio independiente legítimo, no un empleado disfrazado).
// Sin %  ni fecha de expiración — a diferencia del Relevo, este documento
// no vence.
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
  const vendorId = formData.get("vendorId");

  if (!(file instanceof File) || typeof vendorId !== "string" || !vendorId) {
    return NextResponse.json({ error: "Falta el archivo o el id del contratista." }, { status: 400 });
  }

  if (file.size > TAMANO_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo pesa más de 5MB — usa uno más pequeño." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Solo se acepta PDF." }, { status: 400 });
  }

  const { data: vendor, error: fetchError } = await supabase
    .from("vendors")
    .select("id, registro_comerciante_r2_key")
    .eq("id", vendorId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !vendor) {
    return NextResponse.json({ error: "Contratista no encontrado." }, { status: 404 });
  }

  const key = `registro-comerciante-contratistas/${user.id}/${vendorId}-${randomUUID()}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await subirArchivoR2(key, buffer, file.type);
  } catch (err) {
    console.error("Error subiendo registro de comerciante de contratista a R2:", err);
    return NextResponse.json({ error: "No se pudo subir el archivo. Intenta de nuevo." }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("vendors")
    .update({ registro_comerciante_r2_key: key })
    .eq("id", vendorId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (vendor.registro_comerciante_r2_key) {
    try {
      await borrarArchivoR2(vendor.registro_comerciante_r2_key);
    } catch (err) {
      console.error("Error borrando registro de comerciante viejo de contratista en R2:", err);
    }
  }

  return NextResponse.json({ ok: true, key });
}
