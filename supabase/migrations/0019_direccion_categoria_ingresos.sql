-- ============================================================================
-- VICTOR CFO — 0019: amplía el guardarraíl de dirección (0017) a categorías
-- tipo "Ingresos y depósitos", no solo "... - enviado" / "... - recibido".
-- ============================================================================
-- Bug real encontrado el 20 de agosto: varias transferencias ATH Móvil
-- SALIENTES (TRANF ATHM MARTIN MERCADO, TRANF ATHM MASISS — dinero que
-- salió, tipo_flujo = 'gasto') estaban categorizadas como "Ingresos y
-- depósitos", una categoría cuyo nombre promete dinero que ENTRÓ. El
-- guardarraíl de 0017 solo reconocía los sufijos "enviado"/"recibido"
-- (el patrón que se usó para ATH Móvil específicamente) y dejaba pasar
-- cualquier otro nombre de categoría con significado de dirección implícito
-- — "Ingresos y depósitos" es exactamente ese caso: no tiene el sufijo,
-- pero el nombre solo tiene sentido para tipo_flujo = 'ingreso'.
--
-- A propósito NO se agregan palabras como "gasto"/"pago"/"deuda" del lado
-- contrario: categorías como "Pagos de deudas y tarjetas" legítimamente
-- contienen filas con tipo_flujo = 'transferencia' (ej. el pago mensual de
-- la tarjeta desde el checking) — bloquear eso sería el error opuesto.
-- "Ingresos"/"ingreso" es la única palabra donde el nombre es inequívoco.
-- ============================================================================

CREATE OR REPLACE FUNCTION categoria_direccion_valida(p_nombre_categoria text, p_tipo_flujo text)
RETURNS boolean AS $$
BEGIN
  IF p_tipo_flujo IS NULL THEN
    RETURN true;
  END IF;
  IF p_nombre_categoria ILIKE '%enviad%' AND p_tipo_flujo != 'gasto' THEN
    RETURN false;
  END IF;
  IF p_nombre_categoria ILIKE '%recibid%' AND p_tipo_flujo != 'ingreso' THEN
    RETURN false;
  END IF;
  IF p_nombre_categoria ILIKE '%ingres%' AND p_tipo_flujo != 'ingreso' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
