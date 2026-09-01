-- ============================================================================
-- VICTOR CFO — 0021: registra qué modelo(s) manejaron cada turno del chat.
-- ============================================================================
-- Con el enrutamiento Sonnet/Haiku ("balanceado", 21 agosto 2026 — cada
-- turno se intenta primero con Haiku, y solo escala a Sonnet si Haiku pide
-- usar una herramienta), hace falta poder VER directamente en uso_ia_log
-- si el enrutamiento está funcionando de verdad, en vez de inferirlo del
-- costo o los tokens nada más.
-- ============================================================================

ALTER TABLE uso_ia_log ADD COLUMN IF NOT EXISTS modelos_usados text;

-- Se reemplaza la función con un parámetro nuevo al final (con DEFAULT, para
-- no romper ninguna llamada vieja que pudiera quedar en vuelo durante el
-- deploy) — hace falta un DROP explícito primero porque agregar un
-- parámetro cambia la firma de la función y Postgres no lo trata como un
-- simple "reemplazo" de la versión de la migración 0020.
DROP FUNCTION IF EXISTS registrar_uso_ia_detalle(uuid, numeric, int, int, int, int, int, text, text);

CREATE OR REPLACE FUNCTION registrar_uso_ia_detalle(
  p_owner_id uuid,
  p_costo_centavos numeric,
  p_iteraciones int,
  p_input_tokens int,
  p_output_tokens int,
  p_cache_read_tokens int,
  p_cache_creation_tokens int,
  p_herramientas_usadas text,
  p_mensaje_usuario text,
  p_modelos_usados text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() != p_owner_id THEN
    RAISE EXCEPTION 'No autorizado para registrar uso de otro usuario.';
  END IF;

  INSERT INTO uso_ia_log (
    owner_id, costo_centavos, iteraciones, input_tokens, output_tokens,
    cache_read_tokens, cache_creation_tokens, herramientas_usadas, mensaje_usuario, modelos_usados
  ) VALUES (
    p_owner_id, p_costo_centavos, p_iteraciones, p_input_tokens, p_output_tokens,
    p_cache_read_tokens, p_cache_creation_tokens, p_herramientas_usadas, left(p_mensaje_usuario, 200), p_modelos_usados
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION registrar_uso_ia_detalle(uuid, numeric, int, int, int, int, int, text, text, text) TO authenticated;
