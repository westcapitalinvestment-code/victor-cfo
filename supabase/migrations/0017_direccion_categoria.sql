-- ============================================================================
-- VICTOR CFO — 0017: dirección (enviado/recibido) como filtro real del motor
-- de categorización, no solo del chat.
-- ============================================================================
-- Bug real detectado el 20 agosto 2026: al pedirle a VICTOR que moviera las
-- transacciones ATH Móvil viejas a las categorías nuevas "ATH Móvil -
-- enviado" / "ATH Móvil - recibido", 3 transferencias RECIBIDAS (dinero que
-- entró) quedaron archivadas como "enviado". Ya se le puso un guardarraíl a
-- la herramienta de chat (categorizarUna, en lib/victor/tools.ts) para que
-- no vuelva a pasar por ese camino.
--
-- Pero esa no era la causa raíz de fondo: cada vez que una transacción se
-- categoriza (por chat, a mano en la pantalla de Gastos, o automáticamente
-- por el trigger al llegar de Plaid), record_user_correction() aprende un
-- patrón nuevo en merchant_patterns — y ese patrón, una vez confirmado, se
-- le aplica AUTOMÁTICAMENTE a cualquier transacción futura con descripción
-- parecida, sin pasar por el chat ni por ningún guardarraíl de JavaScript.
-- Si el patrón se aprendió mal una sola vez (como pasó aquí), el motor
-- seguiría repitiendo el mismo error para siempre, en cada sincronización
-- nocturna, sin que nadie se diera cuenta hasta mucho después.
--
-- La solución de fondo: el motor mismo (match_category, usado tanto por el
-- trigger de auto-categorización como por la sugerencia que ve el usuario en
-- Inicio) ahora recibe también el tipo_flujo de la transacción, y descarta
-- cualquier categoría cuyo nombre sugiera una dirección ("... - enviado" /
-- "... - recibido") que no coincida con el dinero real que entró o salió.
-- Así, sin importar por cuál de los 3 caminos se intente categorizar, es
-- estructuralmente imposible que una transferencia recibida termine en una
-- categoría de "enviado" (o viceversa) — un solo punto de verdad, no N
-- parches distintos en cada capa.
-- ============================================================================

CREATE OR REPLACE FUNCTION categoria_direccion_valida(p_nombre_categoria text, p_tipo_flujo text)
RETURNS boolean AS $$
BEGIN
  -- Sin tipo_flujo que comparar, no hay nada que validar (deja pasar).
  IF p_tipo_flujo IS NULL THEN
    RETURN true;
  END IF;
  IF p_nombre_categoria ILIKE '%enviad%' AND p_tipo_flujo != 'gasto' THEN
    RETURN false;
  END IF;
  IF p_nombre_categoria ILIKE '%recibid%' AND p_tipo_flujo != 'ingreso' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION match_category(p_raw_description text, p_entity_id uuid, p_tipo_flujo text DEFAULT NULL)
RETURNS TABLE(pattern_id uuid, hacienda_category_id integer, confidence numeric, status text, is_personal boolean) AS $$
BEGIN
  RETURN QUERY
  SELECT mp.id, mp.hacienda_category_id, mp.confidence, mp.status, mp.is_personal
  FROM merchant_patterns mp
  JOIN hacienda_categories hc ON hc.id = mp.hacienda_category_id
  WHERE upper(p_raw_description) LIKE mp.pattern
    AND (mp.entity_id = p_entity_id OR mp.entity_id IS NULL)
    AND mp.status != 'deprecated'
    AND categoria_direccion_valida(hc.nombre, p_tipo_flujo)
  ORDER BY
    (mp.entity_id = p_entity_id) DESC,
    mp.confidence DESC,
    length(mp.pattern) DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION categoria_direccion_valida(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION match_category(text, uuid, text) TO authenticated;

-- Reemplaza trigger_auto_categorize: ahora calcula tipo_flujo PRIMERO (antes
-- vivía después de la categorización) para poder pasárselo a match_category
-- y que el filtro de dirección de arriba tenga con qué comparar.
CREATE OR REPLACE FUNCTION trigger_auto_categorize()
RETURNS trigger AS $$
DECLARE
  v_match RECORD;
  v_tipo_cuenta text;
  v_es_pago_tarjeta boolean;
BEGIN
  -- --- tipo_flujo primero (idéntico cálculo a 0016, solo se movió arriba) ---
  v_tipo_cuenta := NULL;
  IF NEW.plaid_account_id IS NOT NULL THEN
    SELECT type INTO v_tipo_cuenta FROM plaid_accounts WHERE plaid_account_id = NEW.plaid_account_id LIMIT 1;
  ELSIF NEW.manual_account_id IS NOT NULL THEN
    SELECT type INTO v_tipo_cuenta FROM manual_accounts WHERE id = NEW.manual_account_id LIMIT 1;
  END IF;

  v_es_pago_tarjeta := NEW.description_raw ~* '(TELEPAGO|PAYMENT.{0,15}THANK|ONLINE PAYMENT|AUTOPAY|AUTO PAY|PAGO.{0,10}TARJETA|CARD PAYMENT|BALANCE TRANSFER)';

  IF v_tipo_cuenta IN ('credit', 'loan') THEN
    IF NEW.amount > 0 THEN
      NEW.tipo_flujo := 'gasto';
    ELSE
      NEW.tipo_flujo := 'transferencia';
    END IF;
  ELSE
    IF v_es_pago_tarjeta AND NEW.amount > 0 THEN
      NEW.tipo_flujo := 'transferencia';
    ELSIF NEW.amount > 0 THEN
      NEW.tipo_flujo := 'gasto';
    ELSE
      NEW.tipo_flujo := 'ingreso';
    END IF;
  END IF;

  -- --- Categorización (ahora sí sabe la dirección real del dinero) ---
  SELECT * INTO v_match FROM match_category(NEW.description_raw, NEW.entity_id, NEW.tipo_flujo);

  IF v_match.pattern_id IS NOT NULL AND v_match.confidence >= 0.85 AND v_match.status = 'confirmed' THEN
    NEW.hacienda_category_id := v_match.hacienda_category_id;
    NEW.is_personal := v_match.is_personal;
    NEW.matched_pattern_id := v_match.pattern_id;
    NEW.category_overridden_by_user := false;
    UPDATE merchant_patterns SET usage_count = usage_count + 1, last_matched_at = now() WHERE id = v_match.pattern_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger ya existe (trg_auto_categorize, BEFORE INSERT) y sigue
-- apuntando a la misma función — no hace falta recrearlo.
