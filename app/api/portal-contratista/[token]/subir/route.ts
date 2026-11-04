import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { subirArchivoR2 } from "@/lib/r2";

export const runtime = "nodejs";
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAMANO_MAX_BYTES = 5 * 1024 * 1024;

// El contratista envía un documento desde su portal. NUNCA se aplica solo:
// queda 'pendiente' hasta que el dueño lo acepta (el relevo cambia el % de
// retención, así que un enlace filtrado no puede bajarlo por su cuenta).
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!TOKEN_RE.test(params.token)) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  const supabase = createAdminClient();
  const { data: v } = await supabase.from("vendors").select("id, owner_id, entity_id").eq("portal_token", params.token).maybeSingle();
  if (!v) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  const vendor = v as { id: string; owner_id: string; entity_id: string | null };

  const fd = await req.formData();
  const file = fd.get("file");
  const tipo = fd.get("tipo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (tipo !== "relevo" && tipo !== "registro_comerciante") return NextResponse.json({ error: "Tipo de documento inválido." }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Solo se acepta PDF." }, { status: 400 });
  if (file.size > TAMANO_MAX_BYTES) return NextResponse.json({ error: "El archivo pesa más de 5 MB." }, { status: 400 });

  let relevoPct: number | null = null;
  let relevoFecha: string | null = null;
  if (tipo === "relevo") {
    const p = fd.get("relevoPct");
    const f = fd.get("relevoFechaExpiracion");
    if (p !== "0" && p !== "6") return NextResponse.json({ error: "El % del relevo debe ser 6 o 0." }, { status: 400 });
    if (typeof f !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return NextResponse.json({ error: "Fecha de expiración inválida." }, { status: 400 });
    relevoPct = Number(p);
    relevoFecha = f;
  }

  // Tope de envíos pendientes por contratista: evita llenar el almacenamiento.
  const { count } = await supabase.from("vendor_portal_subidas").select("id", { count: "exact", head: true }).eq("vendor_id", vendor.id).eq("estado", "pendiente");
  if ((count ?? 0) >= 5) return NextResponse.json({ error: "Ya tienes envíos en revisión. Espera a que el negocio los acepte." }, { status: 429 });

  const key = `portal-contratistas/${vendor.owner_id}/${vendor.id}-${randomUUID()}.pdf`;
  try {
    await subirArchivoR2(key, Buffer.from(await file.arrayBuffer()), "application/pdf");
  } catch (err) {
    console.error("Error subiendo documento del portal del contratista:", err);
    return NextResponse.json({ error: "No se pudo subir el archivo. Intenta de nuevo." }, { status: 500 });
  }

  const { error } = await supabase.from("vendor_portal_subidas").insert({
    owner_id: vendor.owner_id,
    entity_id: vendor.entity_id,
    vendor_id: vendor.id,
    tipo,
    r2_key: key,
    relevo_pct: relevoPct,
    relevo_fecha_expiracion: relevoFecha,
  });
  if (error) return NextResponse.json({ error: "No se pudo registrar el envío." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
