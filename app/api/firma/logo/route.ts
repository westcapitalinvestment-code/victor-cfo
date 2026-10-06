import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { subirArchivoR2, borrarArchivoR2 } from "@/lib/r2";

// Logo de la firma de contadores (6 oct 2026). Solo para usuarios con
// es_firma_accountant. Mismo patrón que /api/entidades/logo/upload: se
// normaliza a PNG con sharp para que siempre se pueda mostrar/incrustar.
//   GET    → { esFirma, tieneLogo }  (lo usa el engranaje del Portal CPA)
//   POST   → sube/reemplaza el logo (multipart, campo "file")
//   DELETE → quita el logo
const TAMANO_MAX_BYTES = 5 * 1024 * 1024;
const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

async function firmaActual() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("es_firma_accountant, firma_logo_r2_key")
    .eq("id", user.id)
    .maybeSingle();
  return { admin, userId: user.id, esFirma: !!data?.es_firma_accountant, logoKey: (data?.firma_logo_r2_key as string | null) ?? null };
}

export async function GET() {
  const f = await firmaActual();
  if (!f) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  return NextResponse.json({ esFirma: f.esFirma, tieneLogo: !!f.logoKey, userId: f.userId });
}

export async function POST(req: NextRequest) {
  const f = await firmaActual();
  if (!f) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  if (!f.esFirma) return NextResponse.json({ error: "Solo disponible para cuentas Firma Accountant." }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (file.size > TAMANO_MAX_BYTES) {
    return NextResponse.json({ error: "El logo pesa más de 5MB — usa uno más pequeño." }, { status: 400 });
  }
  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    return NextResponse.json({ error: "Solo se aceptan imágenes PNG, JPG o WEBP." }, { status: 400 });
  }

  let bufferPng: Buffer;
  try {
    // Se limita a 600px de ancho/alto máximo: se muestra pequeño en el topbar.
    bufferPng = await sharp(Buffer.from(await file.arrayBuffer()))
      .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch (err) {
    console.error("Error normalizando logo de firma:", err);
    return NextResponse.json({ error: "Esa imagen no se pudo procesar. Prueba con otro archivo (PNG o JPG)." }, { status: 400 });
  }

  const key = `logos-firma/${f.userId}-${randomUUID()}.png`;
  try {
    await subirArchivoR2(key, bufferPng, "image/png");
  } catch (err) {
    console.error("Error subiendo logo de firma a R2:", err);
    return NextResponse.json({ error: "No se pudo subir el logo. Intenta de nuevo." }, { status: 500 });
  }

  const { error } = await f.admin.from("users").update({ firma_logo_r2_key: key }).eq("id", f.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (f.logoKey) {
    try {
      await borrarArchivoR2(f.logoKey);
    } catch (err) {
      console.error("Error borrando logo viejo de firma:", err);
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const f = await firmaActual();
  if (!f) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  if (!f.esFirma) return NextResponse.json({ error: "Solo disponible para cuentas Firma Accountant." }, { status: 403 });

  if (f.logoKey) {
    try {
      await borrarArchivoR2(f.logoKey);
    } catch (err) {
      console.error("Error borrando logo de firma:", err);
    }
  }
  const { error } = await f.admin.from("users").update({ firma_logo_r2_key: null }).eq("id", f.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
