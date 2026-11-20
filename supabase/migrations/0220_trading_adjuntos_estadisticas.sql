-- ============================================================================
-- VICTOR CFO — 0220: Bitácora con archivos + etiquetas TF/setup (19 nov 2026)
-- - trades.timeframe y trades.setup: el usuario etiqueta cada trade para que
--   la pestaña Estadísticas diga qué temporalidad y qué setup le funcionan.
-- - trade_adjuntos: capturas/gráficas/PDF por trade, guardadas en R2
--   (key trading/{owner}/{trade}-{uuid}.{ext}). Solo el dueño (RLS).
-- - Manual de VICTOR: pestaña Estadísticas y archivos en la bitácora.
-- ============================================================================

ALTER TABLE trades ADD COLUMN IF NOT EXISTS timeframe text CHECK (timeframe IS NULL OR char_length(timeframe) <= 10);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS setup text CHECK (setup IS NULL OR char_length(setup) <= 60);

CREATE TABLE IF NOT EXISTS trade_adjuntos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  r2_key text NOT NULL,
  nombre text,
  tipo text,
  bytes int,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trade_adjuntos_trade_idx ON trade_adjuntos (trade_id);
CREATE INDEX IF NOT EXISTS trade_adjuntos_owner_idx ON trade_adjuntos (owner_id);

ALTER TABLE trade_adjuntos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trade_adjuntos_owner ON trade_adjuntos;
CREATE POLICY trade_adjuntos_owner ON trade_adjuntos FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
GRANT ALL ON trade_adjuntos TO authenticated;
GRANT ALL ON trade_adjuntos TO service_role;

UPDATE manual_articulos SET contenido = replace(
  replace(contenido,
    'PESTAÑAS: PANEL, BITÁCORA y RIESGO.',
    'PESTAÑAS: PANEL, BITÁCORA, ESTADÍSTICAS y RIESGO.'),
  '- BITÁCORA: cada trade por día, con duración, SL, TP, reglas rotas, nota y "¿Cumplí mi plan?".',
  '- BITÁCORA: cada trade por día, con duración, SL, TP, reglas rotas, nota, "¿Cumplí mi plan?", temporalidad (TF: M1, M5, M15, M30, H1, H4, D1, W1) y setup/estrategia (texto libre, ej. "ruptura", "pullback"). Se le pueden subir archivos a cada trade (capturas de la gráfica o PDF, hasta 10 MB cada uno): botón "Subir archivo" o pegar una captura con Ctrl+V; se ven como miniaturas, se abren en grande y se pueden borrar.
- ESTADÍSTICAS: usa el mismo filtro de mes. Arriba "Lo que dicen tus números" (mejor y peor activo, sesión y día, y cuánto promedia cumpliendo vs rompiendo reglas; solo con grupos de 3 trades o más). Tarjetas: ganancia y pérdida promedio, ganancia/pérdida (ratio), expectativa por trade (lo que gana o pierde en promedio por trade; si es positiva el sistema gana a la larga), mejor racha ganadora, peor racha perdedora, mejor y peor trade. Tablas con trades, % de aciertos, factor de beneficio, promedio y resultado: por activo, por sesión (hora de PR: Asia 7pm–3am, Londres 3–8am, Londres+Nueva York 8am–12pm, Nueva York tarde 12–4pm, Cierre 4–7pm), por día de la semana, compras vs ventas, por duración, cumpliendo vs rompiendo reglas, por TF y por setup (estas dos salen solo si el usuario etiquetó sus trades en la Bitácora). Gráfica por hora de entrada (hora de PR). Son datos del pasado del usuario, no señales ni recomendaciones.')

WHERE slug = 'trading';
