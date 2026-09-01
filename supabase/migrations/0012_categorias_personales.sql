-- ============================================================================
-- VICTOR CFO — 0012: categorías personales por usuario
-- ============================================================================
-- hacienda_categories (0001) era un catálogo 100% GLOBAL — la misma lista
-- para todos los usuarios, pensada sobre todo para las líneas de Anejo M /
-- Schedule C del reporte al contable. Eso significa que si a un usuario le
-- falta una categoría (ej. "Mascotas - veterinario", "Mesada de los nenes")
-- no tenía forma de añadirla — solo nosotros, editando la semilla (0011).
--
-- Esta migración deja que VICTOR cree categorías PERSONALES por chat, sin
-- tocar el catálogo global ni las líneas fiscales de nadie:
--   - owner_id NULL  = categoría global (las de 0011, visibles para todos).
--   - owner_id = X   = categoría personal de ese usuario únicamente — no
--                      tiene línea de Anejo M/Schedule C (no aplica a
--                      impuestos, es solo para que el usuario organice y
--                      pregunte sus propios gastos, ej. "cuánto gasto en
--                      restaurantes").
--
-- RLS reemplaza la política vieja (lectura pública de TODO) por una que
-- respeta la privacidad: cada usuario ve el catálogo global + solo SUS
-- propias categorías personales, nunca las de otro usuario.
-- ============================================================================

ALTER TABLE hacienda_categories ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS hacienda_categories_read ON hacienda_categories;
CREATE POLICY hacienda_categories_read ON hacienda_categories
  FOR SELECT USING (owner_id IS NULL OR owner_id = auth.uid());

-- Insertar/editar/borrar solo permitido sobre las propias — el catálogo
-- global (owner_id NULL) sigue siendo de solo lectura para los usuarios,
-- se administra únicamente por migración (como 0011).
CREATE POLICY hacienda_categories_owner_write ON hacienda_categories
  FOR ALL USING (owner_id = auth.uid());
