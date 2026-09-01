-- ============================================================================
-- VICTOR CFO — 0020: log de costo POR MENSAJE (no solo el total del mes).
-- ============================================================================
-- uso_ia_mensual (0018) solo guarda un acumulado por mes — suficiente para
-- el tope de gasto, pero inútil para diagnosticar "¿por qué esta
-- conversación de hoy costó $1.24?" sin adivinar. Esta tabla guarda una
-- fila POR CADA turno real del chat con VICTOR (una llamada del usuario,
-- que puede disparar varias llamadas a Claude si hay herramientas de por
-- medio), con el desglose real de tokens/costo — para poder comparar
-- "antes/después" de un cambio (ej. el fix de caché de historial de hoy)
-- con números reales en vez de estimaciones.
-- ============================================================================

CREATE TABLE IF NOT EXISTS uso_ia_log (
  id bigserial PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  costo_centavos numeric NOT NULL DEFAULT 0,
  iteraciones int NOT NULL DEFAULT 1, -- cuántas llamadas a Claude hicieron falta en este turno (tool-use loop)
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cache_read_tokens int NOT NULL DEFAULT 0,
  cache_creation_tokens int NOT NULL DEFAULT 0,
  herramientas_usadas text, -- nombres de tools usadas en este turno, separados por coma, o null si ninguna
  mensaje_usuario text -- primeros ~200 caracteres de lo que escribió el usuario, para poder ubicar cuál mensaje fue
);

CREATE INDEX IF NOT EXISTS uso_ia_log_owner_fecha_idx ON uso_ia_log (owner_id, creado_en DESC);

ALTER TABLE uso_ia_log ENABLE ROW LEVEL SECURITY;

-- Mismo patrón que uso_ia_mensual: el usuario ve su propio historial de
-- costo, pero no puede escribirlo directo — solo vía registrar_uso_ia_detalle
-- (SECURITY DEFINER, abajo).
CREATE POLICY uso_ia_log_select ON uso_ia_log FOR SELECT USING (owner_id = auth.uid());

GRANT SELECT ON uso_ia_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE uso_ia_log_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION registrar_uso_ia_detalle(
  p_owner_id uuid,
  p_costo_centavos numeric,
  p_iteraciones int,
  p_input_tokens int,
  p_output_tokens int,
  p_cache_read_tokens int,
  p_cache_creation_tokens int,
  p_herramientas_usadas text,
  p_mensaje_usuario text
)
RETURNS void AS $$
BEGIN
  -- Mismo chequeo de autorización que registrar_uso_ia (0018): un usuario
  -- normal solo puede loguear SU PROPIO turno.
  IF auth.uid() IS NOT NULL AND auth.uid() != p_owner_id THEN
    RAISE EXCEPTION 'No autorizado para registrar uso de otro usuario.';
  END IF;

  INSERT INTO uso_ia_log (
    owner_id, costo_centavos, iteraciones, input_tokens, output_tokens,
    cache_read_tokens, cache_creation_tokens, herramientas_usadas, mensaje_usuario
  ) VALUES (
    p_owner_id, p_costo_centavos, p_iteraciones, p_input_tokens, p_output_tokens,
    p_cache_read_tokens, p_cache_creation_tokens, p_herramientas_usadas, left(p_mensaje_usuario, 200)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION registrar_uso_ia_detalle(uuid, numeric, int, int, int, int, int, text, text) TO authenticated;
