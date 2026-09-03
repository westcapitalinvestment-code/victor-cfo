-- ============================================================================
-- VICTOR CFO — 0059: Categorías de ingreso personal (trabajo independiente,
-- préstamo, reembolso/regalo)
-- ============================================================================
-- Contexto (3 sept 2026): Joel recibió un pago de cliente vía ATH Móvil
-- PERSONAL (el cliente no tenía ATH Business). VICTOR le preguntó "¿fue
-- pago de cliente, préstamo, o ingreso por servicios?" como si la
-- respuesta cambiara algo — pero en TODO el sistema solo existía una
-- categoría de ingreso ("Ingresos y depósitos", genérica), así que
-- cualquier respuesta terminaba en el mismo lugar. Peor: la transacción
-- vive en la cuenta personal (entity_id NULL) y NUNCA puede "moverse" al
-- lado de negocio de la app — entity_id de una transacción puntual es
-- inmutable, solo se puede reasignar la CUENTA bancaria completa.
--
-- Esta migración añade 3 categorías de ingreso reales del lado personal,
-- porque SÍ importa para efectos de Hacienda distinguir entre:
--   - Ingreso por trabajo independiente: ingreso bruto real, va a la
--     línea 1 de Schedule C / Anejo M — esto es precisamente lo que un
--     freelancer necesita rastrear para su planilla.
--   - Préstamo recibido: no es ingreso tributable.
--   - Reembolso o regalo recibido: tampoco es ingreso tributable.
-- Antes de esto, las 3 se hubieran mezclado indistinguibles bajo
-- "Ingresos y depósitos" — imposible de separar después para el CPA.
--
-- Los 3 nombres nuevos son compatibles con categoria_direccion_valida()
-- (0019) sin cambios: "Ingreso por trabajo independiente" contiene
-- "ingres", "Préstamo recibido" y "Reembolso o regalo recibido" contienen
-- "recibid" — ambos patrones ya exigen tipo_flujo = 'ingreso'.
-- ============================================================================

INSERT INTO hacienda_categories (nombre, linea_anejo_m, linea_schedule_c, deducible_multiplier, es_home_office, activo) VALUES
  ('Ingreso por trabajo independiente', 'Anejo M', 'Schedule C - Línea 1', 1.0, false, true),
  ('Préstamo recibido', NULL, NULL, 1.0, false, true),
  ('Reembolso o regalo recibido', NULL, NULL, 1.0, false, true)
ON CONFLICT DO NOTHING;
