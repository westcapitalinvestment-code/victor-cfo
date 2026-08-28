import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { costoEnCentavos } from "@/lib/costo-ia";
import { fechaHoyPR } from "@/lib/hora-pr";

// Un PDF de estado de cuenta no tiene columnas fijas como un CSV — cada
// banco/tarjeta lo formatea distinto (BPPR no se parece a Citibank, y
// ninguno se parece a un exporte de QuickBooks). En vez de escribir un
// parser distinto por banco, le mandamos el PDF completo a Claude (lee
// PDFs nativamente vía la API, sin librerías de por medio) con una
// herramienta forzada — así la respuesta siempre viene en el formato
// exacto que esperamos, no como texto libre que hay que interpretar.
//
// Este es solo el "paso 1" (extraer + mostrarle al usuario para que
// confirme, igual que con CSV) — nada se guarda en la base de datos
// todavía. El "paso 2" es /api/cuentas/estado/pdf/importar.
export const runtime = "nodejs";
export const maxDuration = 120;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const HERRAMIENTA_EXTRAER = {
  name: "reportar_transacciones",
  description:
    "Reporta la lista completa de transacciones individuales encontradas en el estado de cuenta.",
  input_schema: {
    type: "object" as const,
    properties: {
      transacciones: {
        type: "array" as const,
        description: "Una entrada por cada transacción individual del estado (no incluyas totales ni subtotales).",
        items: {
          type: "object" as const,
          properties: {
            fecha: {
              type: "string" as const,
              description: "Fecha de la transacción en formato YYYY-MM-DD. Si el estado no muestra el año, infiérelo del período del estado de cuenta (aparece en el encabezado).",
            },
            descripcion: {
              type: "string" as const,
              description: "Descripción o nombre del comercio tal como aparece en el estado.",
            },
            monto: {
              type: "number" as const,
              description:
                "Monto SIEMPRE positivo. El signo de gasto/ingreso se indica aparte en 'tipo'.",
            },
            tipo: {
              type: "string" as const,
              enum: ["cargo", "pago_o_credito"],
              description:
                "'cargo' = un gasto/compra/cargo que aumenta lo que debes o reduce tu balance (la gran mayoría de las líneas de un estado). 'pago_o_credito' = un pago que hiciste a la tarjeta, un depósito, reembolso, o crédito a tu favor.",
            },
          },
          required: ["fecha", "descripcion", "monto", "tipo"],
        },
      },
    },
    required: ["transacciones"],
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

  // Clave de ciclo para registrar el costo real de esta llamada — mismo
  // criterio que app/api/victor/route.ts (28 agosto 2026: hasta hoy esta
  // ruta llamaba a Claude Sonnet, el modelo más caro de toda la app, sin
  // registrar nada en uso_ia_mensual/uso_ia_log — el gasto SÍ salía en la
  // cuenta de Anthropic pero el Dashboard de Operaciones nunca lo veía,
  // por eso el "Gasto IA" de un usuario podía quedarse fijo mientras el
  // total real de la cuenta seguía subiendo). Esta ruta no necesita aplicar
  // el tope de gasto (es una acción explícita del usuario, no chat libre),
  // solo sumar el costo real al mismo lugar que lee el Dashboard.
  const { data: perfilCiclo } = await supabase
    .from("users")
    .select("ciclo_inicio")
    .eq("id", user.id)
    .maybeSingle();
  const claveCicloUso = perfilCiclo?.ciclo_inicio ?? fechaHoyPR().slice(0, 7);

  const body = await req.json().catch(() => null);
  const pdfBase64: string | undefined = body?.pdfBase64;
  const nombreArchivo: string = body?.nombreArchivo || "estado de cuenta";

  if (!pdfBase64) {
    return NextResponse.json({ error: "No se recibió el archivo PDF." }, { status: 400 });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      output_config: { effort: "low" },
      system:
        "Eres un asistente contable que lee estados de cuenta bancarios y de tarjetas de crédito de " +
        "Puerto Rico y Estados Unidos, y exporta de QuickBooks convertidos a PDF. Tu único trabajo es " +
        "extraer, con exactitud, cada transacción individual (fecha, descripción, monto, y si es un " +
        "cargo o un pago/crédito) usando la herramienta reportar_transacciones. No incluyas el balance " +
        "inicial, balance final, subtotales, ni totales — solo transacciones individuales reales. Si el " +
        "documento tiene varias páginas, extrae las transacciones de TODAS las páginas. Presta atención " +
        "especial a los números — un dígito mal leído en un monto puede afectar un reporte contable real.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            {
              type: "text",
              text: `Extrae todas las transacciones de este estado de cuenta (${nombreArchivo}) usando la herramienta reportar_transacciones.`,
            },
          ],
        },
      ],
      tools: [HERRAMIENTA_EXTRAER],
      tool_choice: { type: "tool", name: "reportar_transacciones" },
    });

    // Registra el costo real de esta llamada — propio try/catch, nunca debe
    // tumbar la respuesta al usuario si el registro falla.
    try {
      const costoCentavos = costoEnCentavos("claude-sonnet-5", response.usage);
      await supabase.rpc("registrar_uso_ia", {
        p_owner_id: user.id,
        p_costo_centavos: costoCentavos,
        p_ciclo_clave: claveCicloUso,
      });
      await supabase.rpc("registrar_uso_ia_detalle", {
        p_owner_id: user.id,
        p_costo_centavos: costoCentavos,
        p_iteraciones: 1,
        p_input_tokens: response.usage.input_tokens ?? 0,
        p_output_tokens: response.usage.output_tokens ?? 0,
        p_cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
        p_cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
        p_herramientas_usadas: "reportar_transacciones (PDF)",
        p_mensaje_usuario: `[PDF] ${nombreArchivo}`,
        p_modelos_usados: "claude-sonnet-5",
      });
    } catch (err) {
      console.error("No se pudo registrar uso_ia_mensual (extraer PDF):", err);
    }

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "reportar_transacciones"
    );

    if (!toolUse) {
      return NextResponse.json(
        { error: "No se pudo leer el PDF — no se reconoció ninguna transacción. Prueba con un CSV si tu banco lo permite exportar." },
        { status: 422 }
      );
    }

    const input = toolUse.input as { transacciones?: unknown[] };
    const crudas = Array.isArray(input.transacciones) ? input.transacciones : [];

    // Convierte al mismo formato con signo que usa el resto de la app
    // (positivo = gasto/cargo, negativo = ingreso/pago/crédito) y descarta
    // cualquier fila que Claude haya devuelto incompleta o con una fecha
    // que no parezca real.
    const transacciones = crudas
      .map((t) => {
        const fila = t as { fecha?: string; descripcion?: string; monto?: number; tipo?: string };
        if (!fila.fecha || !fila.descripcion || typeof fila.monto !== "number" || !Number.isFinite(fila.monto)) {
          return null;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha)) return null;
        const montoAbs = Math.abs(fila.monto);
        const monto = fila.tipo === "pago_o_credito" ? -montoAbs : montoAbs;
        return { fecha: fila.fecha, descripcion: fila.descripcion.trim(), monto };
      })
      .filter((t): t is { fecha: string; descripcion: string; monto: number } => t !== null);

    if (transacciones.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron transacciones legibles en el PDF. Prueba con un CSV si tu banco lo permite exportar." },
        { status: 422 }
      );
    }

    return NextResponse.json({ transacciones, totalEncontradas: transacciones.length });
  } catch (err) {
    console.error("Error extrayendo transacciones de PDF:", err);
    return NextResponse.json(
      { error: "No se pudo leer el PDF. Intenta de nuevo, o prueba con un CSV si tu banco lo permite exportar." },
      { status: 502 }
    );
  }
}
