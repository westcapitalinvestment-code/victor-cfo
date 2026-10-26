import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { descargarBytesR2, subirArchivoR2 } from "@/lib/r2";
import { MODULOS_MANUAL } from "@/lib/manual-usuario";

// Capturas del Manual de Usuario guardadas en R2 (manual/<módulo>/<paso>.png).
// GET es público (el manual lo leen también los vendedores) y solo sirve
// imágenes del manual. POST (subir) está cerrado salvo que MANUAL_CAPTURAS_ABIERTO=1
// en Vercel (interruptor temporal mientras se toman las capturas) y hay sesión.
export const dynamic = "force-dynamic";

function llave(modulo: string, paso: string): string | null {
  const m = MODULOS_MANUAL.find((x) => x.id === modulo);
  const n = parseInt(paso, 10);
  if (!m || !Number.isInteger(n) || n < 1 || n > m.pasos.length) return null;
  return `manual/${modulo}/${n}.png`;
}

export async function GET(_req: NextRequest, { params }: { params: { modulo: string; paso: string } }) {
  const key = llave(params.modulo, params.paso.replace(/\.png$/, ""));
  if (!key) return new NextResponse("No encontrado", { status: 404 });
  try {
    const bytes = await descargarBytesR2(key);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" },
    });
  } catch {
    return new NextResponse("No encontrado", { status: 404 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { modulo: string; paso: string } }) {
  if (process.env.MANUAL_CAPTURAS_ABIERTO !== "1") {
    return NextResponse.json({ error: "Subida cerrada." }, { status: 403 });
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const key = llave(params.modulo, params.paso);
  if (!key) return NextResponse.json({ error: "Módulo o paso inválido." }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Imagen inválida (máx 8MB)." }, { status: 400 });
  }
  await subirArchivoR2(key, Buffer.from(await file.arrayBuffer()), file.type);
  return NextResponse.json({ ok: true, key });
}
