import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { costoEnCentavos } from "@/lib/costo-ia";
import { fechaHoyPR } from "@/lib/hora-pr";
import { subirArchivoR2 } from "@/lib/r2";
import { randomUUID } from "crypto";

// "Paso 1" de importar un estado de peaje (AutoExpreso u otro sistema
// similar) — mismo patrón exacto que /api/cuentas/estado/pdf/extraer, pero
// pidiéndole a Claude que extraiga cruces de peaje (con placa) en vez de
// transacciones bancarias. Ver migración 0082 para el contexto completo:
// esto es la fuente de verdad real para saber qué CARRO cruzó, algo que el
// banco/Plaid nunca ve porque el cobro les llega consolidado.
export const runtime = "nodejs";
export const maxDuration = 120;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const HERRAMIENTA_EXTRAER_PEAJE = {
  name: "reportar_cruces_peaje",
  description: "Reporta cada cruce de peaje individual encontrado en el estado, con su placa, fecha, plaza y monto.",
  input_schema: {
    type: "object" as const,
    properties: {
      cruces: {
        type: "array" as const,
        description: "Una entrada por cada cruce de peaje real (ej. cada fila 'Video Toll'). No incluyas balance inicial/final ni totales/resúmenes.",
        items: {
          type: "object" as const,
          properties: {
            fecha: {
              type: "string" as const,
              description: "Fecha del cruce (columna 'Transaction Date') en formato YYYY-MM-DD. Si el estado no muestra el año, infiérelo del período del estado (aparece en el encabezado).",
            },
            hora: {
              type: "string" as const,
              description: "Hora del cruce si el documento la muestra, formato HH:MM de 24 horas. Omite el campo si no aparece.",
            },
            placa: {
              type: "string" as const,
              description: "Placa del vehículo (columna 'License' o 'License/State'), tal como aparece impresa, SIN el estado entre paréntesis (ej. '253822M', no '253822M (PR)').",
            },
            plaza: {
              type: "string" as const,
              description: "Nombre de la plaza/estación de peaje (columna 'Plaza'), incluyendo dirección si aparece (ej. 'Hatillo EB').",
            },
            monto: {
              type: "number" as const,
              description: "Monto del cruce, siempre positivo.",
            },
          },
          required: ["fecha", "placa", "monto"],
        },
      },
    },
    required: ["cruces"],
  },
};

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Falta configurar ANTHROPIC_API_KEY en el servidor." }, { status: 500 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfilCiclo } = await supabase.from("users").select("ciclo_inicio").eq("id", user.id).maybeSingle();
  const claveCicloUso = perfilCiclo?.ciclo_inicio ?? fechaHoyPR().slice(0, 7);

  const body = await req.json().catch(() => null);
  const pdfBase64: string | undefined = body?.pdfBase64;
  const nombreArchivo: string = body?.nombreArchivo || "estado de peaje";

  if (!pdfBase64) {
    return NextResponse.json({ error: "No se recibió el archivo PDF." }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      output_config: { effort: "low" },
      system:
        "Eres un asistente contable que lee estados de cuenta de peaje electrónico de Puerto Rico (AutoExpreso, " +
        "Metropistas) y sistemas similares (E-ZPass, SunPass). Tu único trabajo es extraer, con exactitud, cada " +
        "cruce de peaje individual (fecha, hora si está disponible, placa del vehículo, plaza, y monto) usando " +
        "la herramienta reportar_cruces_peaje. No incluyas balance inicial, balance final, ni el resumen de " +
        "totales — solo cruces individuales reales. Si el documento tiene varias páginas, extrae los cruces de " +
        "TODAS las páginas. La placa es el dato más importante de este documento — léela con cuidado, sin " +
        "inventar ni omitir caracteres.",
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: `Extrae todos los cruces de peaje de este estado (${nombreArchivo}) usando la herramienta reportar_cruces_peaje.` },
          ],
        },
      ],
      tools: [HERRAMIENTA_EXTRAER_PEAJE],
      tool_choice: { type: "tool", name: "reportar_cruces_peaje" },
    });

    try {
      const costoCentavos = costoEnCentavos("claude-sonnet-5", response.usage);
      await supabase.rpc("registrar_uso_ia", { p_owner_id: user.id, p_costo_centavos: costoCentavos, p_ciclo_clave: claveCicloUso });
      await supabase.rpc("registrar_uso_ia_detalle", {
        p_owner_id: user.id,
        p_costo_centavos: costoCentavos,
        p_iteraciones: 1,
        p_input_tokens: response.usage.input_tokens ?? 0,
        p_output_tokens: response.usage.output_tokens ?? 0,
        p_cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
        p_cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
        p_herramientas_usadas: "reportar_cruces_peaje (PDF)",
        p_mensaje_usuario: `[PDF peaje] ${nombreArchivo}`,
        p_modelos_usados: "claude-sonnet-5",
      });
    } catch (err) {
      console.error("No se pudo registrar uso_ia_mensual (extraer PDF peaje):", err);
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "reportar_cruces_peaje"
    );

    if (!toolUse) {
      return NextResponse.json({ error: "No se pudo leer el PDF — no se reconoció ningún cruce de peaje." }, { status: 422 });
    }

    const input = toolUse.input as { cruces?: unknown[] };
    const crudas = Array.isArray(input.cruces) ? input.cruces : [];

    const cruces = crudas
      .map((c) => {
        const fila = c as { fecha?: string; hora?: string; placa?: string; plaza?: string; monto?: number };
        if (!fila.fecha || !fila.placa || typeof fila.monto !== "number" || !Number.isFinite(fila.monto)) return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha)) return null;
        const hora = fila.hora && /^\d{2}:\d{2}$/.test(fila.hora) ? fila.hora : null;
        return {
          fecha: fila.fecha,
          hora,
          placa: fila.placa.trim().toUpperCase(),
          plaza: fila.plaza?.trim() || null,
          monto: Math.abs(fila.monto),
        };
      })
      .filter((c): c is { fecha: string; hora: string | null; placa: string; plaza: string | null; monto: number } => c !== null);

    if (cruces.length === 0) {
      return NextResponse.json({ error: "No se encontraron cruces de peaje legibles en el PDF." }, { status: 422 });
    }

    let r2Key: string | null = null;
    try {
      r2Key = `peajes/${user.id}/${randomUUID()}.pdf`;
      await subirArchivoR2(r2Key, Buffer.from(pdfBase64, "base64"), "application/pdf");
    } catch (err) {
      console.error("No se pudo guardar el PDF de peaje original en R2 (no afecta la extracción):", err);
      r2Key = null;
    }

    return NextResponse.json({ cruces, totalEncontrados: cruces.length, r2Key });
  } catch (err) {
    console.error("Error extrayendo cruces de peaje de PDF:", err);
    return NextResponse.json({ error: "No se pudo leer el PDF. Intenta de nuevo." }, { status: 502 });
  }
}
