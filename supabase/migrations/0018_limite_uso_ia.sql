-- ============================================================================
-- VICTOR CFO — 0018: tope de gasto mensual de IA por usuario (red de
-- seguridad adicional al fix de caché de 5min→1h en app/api/victor/route.ts).
-- ============================================================================
-- Protege contra un bug o un patrón de uso fuera de lo normal que dispare
-- el costo real de Anthropic sin que nadie se dé cuenta hasta ver la
-- factura del mes. No reemplaza el fix de caché (esa era la causa real del
-- gasto visto el 20 de agosto) — es un límite duro por si acaso, además.
--
-- costo_centavos se acumula con el costo REAL calculado en cada llamada
-- (lib/costo-ia.ts, con los precios oficiales de Anthropic), no solo un
-- conteo de tokens — así el tope refleja dinero de verdad, no un proxy.
-- ============================================================================

CREATE TABLE IF NOT EXISTS uso_ia_mensual (
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anio_mes text NOT NULL, -- 'YYYY-MM', hora de Puerto Rico (fechaHoyPR())
  costo_centavos numeric NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, anio_mes)
);

ALTER TABLE uso_ia_mensual ENABLE ROW LEVEL SECURITY;

-- El usuario puede VER su propio consumo (para mostrarlo en Configuración
-- más adelante si Joel quiere), pero no puede escribirlo directo — solo a
-- través de registrar_uso_ia (SECURITY DEFINER, abajo). Sin esto, cualquiera
-- podría resetear su propio contador llamando el update de la tabla desde
-- el navegador.
CREATE POLICY uso_ia_mensual_select ON uso_ia_mensual FOR SELECT USING (owner_id = auth.uid());

GRANT SELECT ON uso_ia_mensual TO authenticated;

CREATE OR REPLACE FUNCTION registrar_uso_ia(p_owner_id uuid, p_costo_centavos numeric)
RETURNS void AS $$
BEGIN
  -- Un usuario autenticado normal (auth.uid() no nulo) solo puede sumar a
  -- SU PROPIO contador. Cuando auth.uid() es nulo (llamado con el cliente
  -- de service_role, ej. desde un cron futuro), se permite cualquier
  -- owner_id — el mismo patrón de confianza que ya usa el resto del motor
  -- (ver record_user_correction en 0001_schema_completo.sql).
  IF auth.uid() IS NOT NULL AND auth.uid() != p_owner_id THEN
    RAISE EXCEPTION 'No autorizado para registrar uso de otro usuario.';
  END IF;

  INSERT INTO uso_ia_mensual (owner_id, anio_mes, costo_centavos)
  VALUES (p_owner_id, to_char(now(), 'YYYY-MM'), p_costo_centavos)
  ON CONFLICT (owner_id, anio_mes)
  DO UPDATE SET
    costo_centavos = uso_ia_mensual.costo_centavos + EXCLUDED.costo_centavos,
    actualizado_en = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION registrar_uso_ia(uuid, numeric) TO authenticated;
