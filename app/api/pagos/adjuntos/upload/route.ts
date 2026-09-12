import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2 } from "@/lib/r2";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";

// Sube UN archivo de evidencia (factura del contratista, recibo, etc.) de un
// pago registrado en Pagos a Cloudflare R2 y crea su fila en
// vendor_retencion_attachments — calcado de /api/facturas/adjuntos/upload,
// mismo patrón de "Evidencia del trabajo" (12 sept 2026, pedido de Joel).
//
// ownerId efectivo (12 sept 2026, fix de raíz): un Administrador tiene SU
// PROPIO user.id (su propia cuenta de Supabase Auth), nunca igual al
// owner_id real del dueño del negocio. Sin esto, el filtro de abajo nunca
// encontraba el pago (aunque la RLS de la migración 0086 sí lo permitiera) y
// el INSERT dejaba el archivo colgando del user.id del admin en vez del
// dueño — mismo bug que ya tenía /api/facturas/adjuntos/upload.
const TAMANO_MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const efectivo = user.email ? await resolverOwnerEfectivo(supabase, user.email) : null;
  const ownerId = efectivo?.ownerId ?? user.id;

  const formData = await req.formData();
  const file = formData.get("file");
  const vendorRetencionId = formData.get("vendorRetencionId");
  const nombreArchivo = typeof formData.get("nombreArchivo") === "string" ? (formData.get("nombreArchivo") as string) : null;

  if (!(file instanceof File) || typeof vendorRetencionId !== "string" || !vendorRetencionId) {
    return NextResponse.json({ error: "Falta el archivo o el id del pago." }, { status: 400 });
  }

  if (file.size > TAMANO_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo pesa más de 15MB — usa uno más pequeño." }, { status: 400 });
  }

  const { data: pago, error: fetchError } = await supabase
    .from("vendor_retenciones")
    .select("id")
    .eq("id", vendorRetencionId)
    .eq("owner_id", ownerId)
    .single();

  if (fetchError || !pago) {
    return NextResponse.json({ error: "Pago no encontrado." }, { status: 404 });
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const key = `pagos/${ownerId}/${vendorRetencionId}-${randomUUID()}.${extension}`;
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
    .from("vendor_retencion_attachments")
    .insert({
      vendor_retencion_id: vendorRetencionId,
      owner_id: ownerId,
      nombre_archivo: nombreArchivo || file.name,
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
