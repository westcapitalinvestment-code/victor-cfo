import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2, borrarArchivoR2 } from "@/lib/r2";

// Sube el Certificado de Relevo de Retención (PDF) de UN CONTRATISTA a R2 —
// mismo patrón que /api/entidades/relevo/upload, pero por vendor (30 sept
// 2026, pedido de Joel a raíz de la conversación con su CPA: sin el relevo
// archivado con fecha de expiración vigente, el 6%/0% que alguien le puso
// al contratista en pantalla no tiene respaldo real ante Hacienda — la
// Sección 1062.03(g) exige el papel radicado, no solo el % escrito).
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
  const relevoPct = formData.get("relevoPct");
  const relevoFechaExpiracion = formData.get("relevoFechaExpiracion");

  if (!(file instanceof File) || typeof vendorId !== "string" || !vendorId) {
    return NextResponse.json({ error: "Falta el archivo o el id del contratista." }, { status: 400 });
  }
  if (relevoPct !== "0" && relevoPct !== "6") {
    return NextResponse.json({ error: "El % del relevo debe ser 6 (parcial) o 0 (total)." }, { status: 400 });
  }
  if (typeof relevoFechaExpiracion !== "string" || !relevoFechaExpiracion) {
    return NextResponse.json({ error: "Falta la fecha de expiración del relevo." }, { status: 400 });
  }

  if (file.size > TAMANO_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo pesa más de 5MB — usa uno más pequeño." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Solo se acepta PDF." }, { status: 400 });
  }

  const { data: vendor, error: fetchError } = await supabase
    .from("vendors")
    .select("id, relevo_r2_key")
    .eq("id", vendorId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !vendor) {
    return NextResponse.json({ error: "Contratista no encontrado." }, { status: 404 });
  }

  const key = `relevo-contratistas/${user.id}/${vendorId}-${randomUUID()}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await subirArchivoR2(key, buffer, file.type);
  } catch (err) {
    console.error("Error subiendo relevo de contratista a R2:", err);
    return NextResponse.json({ error: "No se pudo subir el archivo. Intenta de nuevo." }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("vendors")
    .update({
      relevo_r2_key: key,
      relevo_pct: Number(relevoPct),
      relevo_fecha_expiracion: relevoFechaExpiracion,
    })
    .eq("id", vendorId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (vendor.relevo_r2_key) {
    try {
      await borrarArchivoR2(vendor.relevo_r2_key);
    } catch (err) {
      console.error("Error borrando relevo viejo de contratista en R2:", err);
    }
  }

  return NextResponse.json({ ok: true, key });
}
