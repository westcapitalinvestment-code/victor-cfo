import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { procesarComentario, suscribirPagina, type ComentarioMeta } from "@/lib/meta-comentarios";

// Webhook de Meta (22 nov 2026): comentarios nuevos en la página Victor CFO y
// en sus anuncios (campo "feed") y en Instagram (campo "comments"). Lo procesa
// el agente de lib/meta-comentarios.ts.
// Variables en Vercel: META_VERIFY_TOKEN, META_APP_SECRET, META_PAGE_ACCESS_TOKEN,
// META_PAGE_ID (y META_IG_ID si se conecta Instagram). META_AGENTE_ACTIVO=0 lo apaga.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Verificación al suscribir el webhook en developers.facebook.com
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const esperado = process.env.META_VERIFY_TOKEN;
  if (esperado && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === esperado) {
    // De paso, conecta la página a la app (si ya hay token). No bloquea la verificación.
    await suscribirPagina().catch(() => null);
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

function firmaValida(raw: string, firma: string | null): boolean {
  const secreto = process.env.META_APP_SECRET;
  if (!secreto || !firma?.startsWith("sha256=")) return false;
  const esperado = crypto.createHmac("sha256", secreto).update(raw, "utf8").digest("hex");
  const a = Buffer.from(firma.slice(7), "hex");
  const b = Buffer.from(esperado, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type Cambio = { field?: string; value?: Record<string, unknown> };

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!firmaValida(raw, req.headers.get("x-hub-signature-256"))) return new NextResponse("Firma inválida", { status: 401 });
  const body = JSON.parse(raw || "{}") as { object?: string; entry?: { id?: string; changes?: Cambio[] }[] };
  const paginaId = process.env.META_PAGE_ID ?? "";
  const igId = process.env.META_IG_ID ?? "";

  const comentarios: ComentarioMeta[] = [];
  for (const e of body.entry ?? []) {
    for (const ch of e.changes ?? []) {
      const v = ch.value ?? {};
      const from = (v.from ?? {}) as { id?: string; name?: string; username?: string };
      // Facebook: comentarios nuevos de otras personas (no los de la propia página)
      if (body.object === "page" && ch.field === "feed" && v.item === "comment" && v.verb === "add") {
        if (!from.id || from.id === paginaId || from.id === e.id) continue;
        const msg = typeof v.message === "string" ? v.message : "";
        if (!msg.trim()) continue;
        comentarios.push({
          plataforma: "facebook",
          commentId: String(v.comment_id ?? ""),
          postId: typeof v.post_id === "string" ? v.post_id : null,
          autorId: from.id,
          autorNombre: from.name ?? null,
          mensaje: msg,
        });
      }
      // Instagram
      if (body.object === "instagram" && ch.field === "comments") {
        if (!from.id || from.id === igId || from.id === e.id) continue;
        const msg = typeof v.text === "string" ? v.text : "";
        if (!msg.trim() || !v.id) continue;
        comentarios.push({
          plataforma: "instagram",
          commentId: String(v.id),
          postId: typeof (v.media as { id?: string } | undefined)?.id === "string" ? (v.media as { id: string }).id : null,
          autorId: from.id,
          autorNombre: from.username ?? null,
          mensaje: msg,
        });
      }
    }
  }

  for (const c of comentarios.filter((x) => x.commentId)) {
    try {
      await procesarComentario(c);
    } catch {
      /* se registra dentro de procesarComentario */
    }
  }
  return NextResponse.json({ ok: true, procesados: comentarios.length });
}
