import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { obtenerContextoTecnico } from "@/lib/tecnico-contexto";
import { subirArchivoR2 } from "@/lib/r2";

const TAMANO_MAX_BYTES = 15 * 1024 * 1024;

// Sube evidencia (foto del trabajo o firma del cliente) a la MISMA tabla
// invoice_attachments que ya usa Facturación (app/api/facturas/adjuntos/
// upload) — mismo bucket de R2, mismo modelo, así que las fotos que sube
// el técnico se ven igual que cualquier adjunto de factura en el detalle
// que ve el dueño. tipo se guarda como 'foto' o 'firma' para poder
// distinguirlas en la UI.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada." }, { status: 401 });

  const { data: factura } = await ctx.admin
    .from("invoices")
    .select("id")
    .eq("id", params.id)
    .eq("entity_id", ctx.tecnico.entity_id)
    .eq("technician_id", ctx.tecnico.id)
    .maybeSingle();
  if (!factura) return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const tipo = body?.tipo === "firma" ? "firma" : "foto";
  const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return NextResponse.json({ error: "Imagen inválida." }, { status: 400 });

  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > TAMANO_MAX_BYTES) {
    return NextResponse.json({ error: "La imagen pesa más de 15MB." }, { status: 400 });
  }

  const extension = contentType.split("/")[1] || "jpg";
  const key = `facturas/${ctx.tecnico.owner_id}/${params.id}-${tipo}-${randomUUID()}.${extension}`;

  try {
    await subirArchivoR2(key, buffer, contentType);
  } catch (err) {
    console.error("Error subiendo evidencia a R2:", err);
    return NextResponse.json({ error: "No se pudo subir la imagen. Intenta de nuevo." }, { status: 500 });
  }

  const { data: adjunto, error } = await ctx.admin
    .from("invoice_attachments")
    .insert({
      invoice_id: params.id,
      owner_id: ctx.tecnico.owner_id,
      nombre_archivo: tipo === "firma" ? "Firma del cliente" : "Foto de evidencia",
      tipo,
      r2_key: key,
      tamano_bytes: buffer.byteLength,
    })
    .select("id")
    .single();

  if (error || !adjunto) return NextResponse.json({ error: error?.message ?? "No se pudo guardar la evidencia." }, { status: 500 });
  return NextResponse.json({ ok: true, id: adjunto.id });
}
