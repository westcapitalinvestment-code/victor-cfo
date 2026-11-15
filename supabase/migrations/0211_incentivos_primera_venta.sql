-- ============================================================================
-- VICTOR CFO — 0211: "¿Ya tuvo su primera venta?" (15 nov 2026)
-- ============================================================================
-- PYME Nueva y Joven Empresario dependen de que el negocio NO haya tenido
-- ventas. Inferirlo del banco falla: entran depósitos que no son ventas
-- (dinero del dueño o de otra empresa suya, cashback, verificaciones del
-- banco). Ahora el dueño lo contesta; si no ha contestado, se infiere de las
-- transacciones ignorando esos depósitos.
-- ============================================================================
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS ya_tuvo_ventas boolean;
