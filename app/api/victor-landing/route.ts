import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { VICTOR_LANDING_SYSTEM_PROMPT } from "@/lib/victor/landing-system-prompt";

// Endpoint PÚBLICO — a propósito no usa createClient()/auth. Cualquier
// visitante del landing (sin cuenta) puede llamarlo desde la burbuja de
// VICTOR. Por eso los guardrails viven todos aquí, del lado del servidor,
// y no se puede confiar en nada que mande el cliente salvo el mensaje y el
// historial corto de la conversación (que ni siquiera se guarda en DB).

export const runtime = "nodejs";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Rate limit en memoria del proceso — suficiente para frenar abuso normal
// (alguien refrescando el chat en loop) aunque no es perfecto: en Vercel
// cada instancia serverless tiene su propio Map, así que un atacante
// distribuido podría esquivarlo. Para el volumen de un landing de
// lanzamiento esto es un guardrail razonable v1; si el abuso se vuelve un
// problema real, la solución de raíz es mover esto a Upstash/Redis con
// límite compartido entre instancias.
const VENTANA_MS = 60_000;
const MAX_POR_VENTANA = 6;
const historialPorIP = new Map<string, number[]>();

function ipDelRequest(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "desconocida";
}

function excedeLimite(ip: string): boolean {
  const ahora = Date.now();
  const marcas = (historialPorIP.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  if (marcas.length >= MAX_POR_VENTANA) {
    historialPorIP.set(ip, marcas);
    return true;
  }
  marcas.push(ahora);
  historialPorIP.set(ip, marcas);
  return false;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_MENSAJE_CHARS = 800;
const MAX_HISTORIAL = 8; // últimos N mensajes que manda el cliente, ida y vuelta

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "VICTOR no está configurado todavía." },
      { status: 500 }
    );
  }

  const ip = ipDelRequest(req);
  if (excedeLimite(ip)) {
    return NextResponse.json(
      { error: "Dale un momento antes de seguir preguntando — estás escribiendo muy rápido." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const mensaje: string | undefined = body?.message;
  const historialCrudo: ChatMessage[] = Array.isArray(body?.history) ? body.history : [];

  if (!mensaje || typeof mensaje !== "string" || !mensaje.trim()) {
    return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
  }
  if (mensaje.length > MAX_MENSAJE_CHARS) {
    return NextResponse.json(
      { error: "Ese mensaje es muy largo — intenta resumirlo un poco." },
      { status: 400 }
    );
  }

  // El historial es SOLO lo que el cliente ya mostró en pantalla en esta
  // misma sesión de chat (nunca se persiste en Supabase) — se recorta acá
  // también por si acaso, para no dejar que alguien mande un historial
  // gigante y dispare costo de tokens.
  const historial = historialCrudo
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_HISTORIAL)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MENSAJE_CHARS) }));

  try {
    const respuesta = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 400,
      system: VICTOR_LANDING_SYSTEM_PROMPT,
      messages: [...historial, { role: "user", content: mensaje }],
    });

    const texto = respuesta.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();

    return NextResponse.json({ reply: texto || "No pude generar una respuesta, intenta de nuevo." });
  } catch (err) {
    console.error("[victor-landing] error:", err);
    return NextResponse.json(
      { error: "VICTOR no pudo responder en este momento. Intenta de nuevo en un momento." },
      { status: 500 }
    );
  }
}
