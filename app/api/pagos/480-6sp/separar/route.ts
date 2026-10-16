import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { subirArchivoR2 } from "@/lib/r2";

// Separa el PDF combinado de 480.6SP (un formulario por página) y detecta
// a qué contratista corresponde cada página leyendo "persona que recibe el
// pago" con visión (los escaneos no traen capa de texto).
export const runtime = "nodejs";
export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const HERRAMIENTA = {
  name: "reportar_receptores",
  description: "Reporta, por cada página del PDF, el nombre de la persona que recibe el pago y los últimos 4 dígitos de su seguro social / EIN.",
  input_schema: {
    type: "object" as const,
    properties: {
      paginas: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            pagina: { type: "number" as const, description: "Número de página (1 = primera)." },
            nombre: { type: "string" as const, description: "Nombre completo de quien RECIBE el pago (no el agente retenedor)." },
            ultimos4: { type: "string" as const, description: "Últimos 4 dígitos del SSN/EIN de quien recibe el pago. Vacío si no se lee." },
          },
          required: ["pagina", "nombre"],
        },
      },
    },
    required: ["paginas"],
  },
};

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY." }, { status: 500 });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const entityId = (form?.get("entityId") as string) || null;
  if (!(file instanceof File)) return NextResponse.json({ error: "Falta el PDF." }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "El PDF pasa de 25 MB." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  let origen: PDFDocument;
  try {
    origen = await PDFDocument.load(bytes);
  } catch {
    return NextResponse.json({ error: "No se pudo abrir el PDF." }, { status: 400 });
  }
  const total = origen.getPageCount();
  if (total > 60) return NextResponse.json({ error: "El PDF tiene más de 60 páginas." }, { status: 400 });

  let detectadas: { pagina: number; nombre: string; ultimos4?: string }[] = [];
  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      output_config: { effort: "low" },
      system:
        "Lees formularios Modelo 480.6SP de Puerto Rico escaneados, uno por página. Para cada página identifica a la " +
        "PERSONA QUE RECIBE EL PAGO (bloque 'información de la persona que recibe el pago'), no al agente retenedor " +
        "que lo emite. Usa la herramienta reportar_receptores con todas las páginas.",
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
          { type: "text", text: `El PDF tiene ${total} páginas. Reporta el receptor de cada una.` },
        ],
      }],
      tools: [HERRAMIENTA],
      tool_choice: { type: "tool", name: "reportar_receptores" },
    });
    const tu = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const inp = tu?.input as { paginas?: { pagina: number; nombre: string; ultimos4?: string }[] } | undefined;
    detectadas = Array.isArray(inp?.paginas) ? inp.paginas : [];
  } catch (err) {
    console.error("Error leyendo 480.6SP:", err);
    // seguimos: el usuario podrá asignar a mano
  }

  let vq = supabase.from("vendors").select("id, name, tax_id").eq("owner_id", user.id).eq("active", true);
  if (entityId) vq = vq.eq("entity_id", entityId);
  const { data: vendors } = await vq;
  const lista = (vendors ?? []) as { id: string; name: string; tax_id: string | null }[];

  const paginas: { key: string; pagina: number; nombre: string; ultimos4: string; vendorId: string | null }[] = [];
  for (let i = 0; i < total; i++) {
    const det = detectadas.find((d) => Number(d.pagina) === i + 1);
    const nombre = det?.nombre?.trim() ?? "";
    const ultimos4 = (det?.ultimos4 ?? "").replace(/\D/g, "").slice(-4);

    const nuevo = await PDFDocument.create();
    const [pg] = await nuevo.copyPages(origen, [i]);
    nuevo.addPage(pg);
    const buf = Buffer.from(await nuevo.save());
    const key = `480-6sp/${user.id}/${randomUUID()}.pdf`;
    await subirArchivoR2(key, buf, "application/pdf");

    // match: últimos 4 del tax id (si hay) y/o tokens del nombre
    const tokens = new Set(norm(nombre).split(" ").filter((t) => t.length > 1));
    let mejor: { id: string; score: number } | null = null;
    for (const v of lista) {
      let score = 0;
      const vt = norm(v.name).split(" ").filter((t) => t.length > 1);
      if (tokens.size && vt.length) {
        const comunes = vt.filter((t) => tokens.has(t)).length;
        score += comunes / Math.max(vt.length, tokens.size);
      }
      const v4 = (v.tax_id ?? "").replace(/\D/g, "").slice(-4);
      if (ultimos4.length === 4 && v4 === ultimos4) score += 1;
      if (!mejor || score > mejor.score) mejor = { id: v.id, score };
    }
    paginas.push({ key, pagina: i + 1, nombre, ultimos4, vendorId: mejor && mejor.score >= 0.6 ? mejor.id : null });
  }

  return NextResponse.json({ paginas });
}
