import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2 } from "@/lib/r2";

// Sube UN archivo de "Evidencia del trabajo" (reporte/foto) de una factura
// a Cloudflare R2 y crea su fila en invoice_attachments — calcado de
// /api/documentos/upload, mismo patrón de la Bóveda.
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
  const invoiceId = formData.get("invoiceId");
  const nombreArchivo = typeof formData.get("nombreArchivo") === "string" ? (formData.get("nombreArchivo") as string) : null;

  if (!(file instanceof File) || typeof invoiceId !== "string" || !invoiceId) {
    return NextResponse.json({ error: "Falta el archivo o el id de la factura." }, { status: 400 });
  }

  if (file.size > TAMANO_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo pesa más de 15MB — usa uno más pequeño." }, { status: 400 });
  }

  const { data: factura, error: fetchError } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !factura) {
    return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const key = `facturas/${user.id}/${invoiceId}-${randomUUID()}.${extension}`;
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
    .from("invoice_attachments")
    .insert({
      invoice_id: invoiceId,
      owner_id: user.id,
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
