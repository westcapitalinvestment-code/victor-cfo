// Calcula el costo real (en centavos) de una llamada a Claude a partir del
// campo `usage` que devuelve la API — para el tope de gasto mensual por
// usuario (ver app/api/victor/route.ts) y para cualquier otra ruta que en
// el futuro quiera medir costo real en vez de solo contar tokens.
//
// Precios oficiales de Anthropic, confirmados en docs.claude.com/en/docs/
// about-claude/pricing el 20 de agosto de 2026 — en centavos por millón de
// tokens (MTok), así se puede sumar todo en enteros/decimales simples sin
// arrastrar errores de punto flotante de dólares. Si Anthropic cambia
// precios, este es el único lugar que hace falta actualizar.
type PrecioModelo = {
  inputCentavosPorMillon: number;
  cacheWrite5mCentavosPorMillon: number;
  cacheWrite1hCentavosPorMillon: number;
  cacheReadCentavosPorMillon: number;
  outputCentavosPorMillon: number;
};

const PRECIOS: Record<string, PrecioModelo> = {
  "claude-sonnet-5": {
    inputCentavosPorMillon: 200,
    cacheWrite5mCentavosPorMillon: 250,
    cacheWrite1hCentavosPorMillon: 400,
    cacheReadCentavosPorMillon: 20,
    outputCentavosPorMillon: 1000,
  },
  "claude-haiku-4-5": {
    inputCentavosPorMillon: 100,
    cacheWrite5mCentavosPorMillon: 125,
    cacheWrite1hCentavosPorMillon: 200,
    cacheReadCentavosPorMillon: 10,
    outputCentavosPorMillon: 500,
  },
};

// Forma mínima del campo `usage` de la respuesta de Anthropic que
// necesitamos — así este archivo no depende del tipo exacto del SDK.
export type UsoAnthropic = {
  input_tokens: number | null;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number } | null;
};

export function costoEnCentavos(model: string, usage: UsoAnthropic): number {
  const precio = PRECIOS[model];
  if (!precio) return 0; // Modelo no listado — no debería pasar, pero mejor no tumbar la respuesta por esto.

  const write5m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  // Si el SDK no trae el desglose por TTL (cache_creation), pero sí el
  // total (cache_creation_input_tokens), lo tratamos como si fuera todo
  // de 5 minutos — es el caso más común y evita SUBESTIMAR el costo real
  // si algún día falta el campo nuevo.
  const totalConDesglose = write5m + write1h;
  const writeSinDesglose = totalConDesglose > 0 ? 0 : usage.cache_creation_input_tokens ?? 0;

  const centavos =
    (usage.input_tokens ?? 0) * precio.inputCentavosPorMillon +
    write5m * precio.cacheWrite5mCentavosPorMillon +
    write1h * precio.cacheWrite1hCentavosPorMillon +
    writeSinDesglose * precio.cacheWrite5mCentavosPorMillon +
    (usage.cache_read_input_tokens ?? 0) * precio.cacheReadCentavosPorMillon +
    usage.output_tokens * precio.outputCentavosPorMillon;

  return centavos / 1_000_000;
}
