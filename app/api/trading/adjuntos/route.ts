import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2 } from "@/lib/r2";

// Bitácora de Trading: archivos por trade (capturas de la gráfica, PDF).
// GET ?tradeId=… lista; POST (formData file + tradeId) sube a R2 y crea la
// fila en trade_adjuntos. Solo el dueño del trade (RLS de trades).
const TAMANO_MAX_BYTES = 10 * 1024 * 1024;
const TIPOS_OK = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/;

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  const tradeId = req.nextUrl.searchParams.get("tradeId");
  if (!tradeId) return NextResponse.json({ error: "Falta el trade." }, { status: 400 });
  const { data, error } = await supabase
    .from("trade_adjuntos")
    .select("id, nombre, tipo, bytes, created_at")
    .eq("trade_id", tradeId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ adjuntos: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");
  const tradeId = formData.get("tradeId");
  if (!(file instanceof File) || typeof tradeId !== "string" || !tradeId) {
    return NextResponse.json({ error: "Falta el archivo o el trade." }, { status: 400 });
  }
  if (file.size > TAMANO_MAX_BYTES) return NextResponse.json({ error: "El archivo pesa más de 10 MB." }, { status: 400 });
  if (!TIPOS_OK.test(file.type)) return NextResponse.json({ error: "Solo imágenes (PNG, JPG, WEBP, GIF) o PDF." }, { status: 400 });

  const { data: trade } = await supabase.from("trades").select("id, owner_id").eq("id", tradeId).eq("owner_id", user.id).maybeSingle();
  if (!trade) return NextResponse.json({ error: "Trade no encontrado." }, { status: 404 });

  const { count } = await supabase.from("trade_adjuntos").select("id", { count: "exact", head: true }).eq("trade_id", tradeId);
  if ((count ?? 0) >= 10) return NextResponse.json({ error: "Máximo 10 archivos por trade." }, { status: 400 });

  const ext = (file.name.includes(".") ? file.name.split(".").pop() : file.type.split("/")[1] || "bin")!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const key = `trading/${user.id}/${tradeId}-${randomUUID()}.${ext}`;
  try {
    await subirArchivoR2(key, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (err) {
    console.error("Error subiendo adjunto de trading a R2:", err);
    return NextResponse.json({ error: "No se pudo subir el archivo. Intenta de nuevo." }, { status: 500 });
  }

  const { data: fila, error } = await supabase
    .from("trade_adjuntos")
    .insert({ owner_id: user.id, trade_id: tradeId, r2_key: key, nombre: file.name.slice(0, 120) || null, tipo: file.type, bytes: file.size })
    .select("id, nombre, tipo, bytes, created_at")
    .single();
  if (error || !fila) return NextResponse.json({ error: error?.message ?? "No se pudo guardar." }, { status: 500 });
  return NextResponse.json({ ok: true, adjunto: fila });
}
