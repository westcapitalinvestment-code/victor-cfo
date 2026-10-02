-- VICTOR CFO — 0130: RLS de hacienda_categories faltante para CPA/Admin
-- ============================================================================
-- Hallazgo (2 oct 2026, Joel probando el Portal CPA real con VIP Medical
-- Development): el tab Resultados mostraba "Sin categorizar" repetido 6+
-- veces en Ingresos y varias veces en Gastos, cada uno con un monto
-- distinto, en vez de agruparse en una sola fila.
--
-- NO es un problema de datos huérfanos ni de FK rota — la columna
-- hacienda_category_id de cada transacción apunta a una fila real y
-- vigente de hacienda_categories. El problema es que hacienda_categories
-- quedó particionada por owner_id desde la migración 0012
-- (categorías personales: owner_id IS NULL = catálogo global, owner_id =
-- <user> = categorías propias de ese usuario/negocio) con esta política:
--
--   CREATE POLICY hacienda_categories_read ON hacienda_categories
--     FOR SELECT USING (owner_id IS NULL OR owner_id = auth.uid());
--
-- Esa política nunca se actualizó cuando la migración 0003 construyó todo
-- el patrón *_cpa_read para los demás catálogos (clients, vendors,
-- invoices, transactions, etc.) — hacienda_categories quedó fuera.
--
-- Efecto real: lib/estado-resultados.ts arma su matriz corriendo con el
-- cliente Supabase de LA SESIÓN DE QUIEN MIRA (el CPA, no el dueño). Como
-- VIP Medical Development tiene varias categorías propias creadas por
-- VICTOR o por el dueño (crear_categoria_personal en lib/victor/tools.ts),
-- cuando el CPA consulta hacienda_categories esas filas simplemente no
-- existen para su sesión (RLS las oculta) — no es que falten en la base
-- de datos. categoriaPorId.get(catId) devuelve undefined para cada una de
-- esas categorías ocultas, y como la función usa "nombre: cat?.nombre ??
-- 'Sin categorizar'" pero sigue agrupando por catId real (no por el label
-- de fallback), cada categoría oculta queda como su propia fila fantasma
-- con la misma etiqueta "Sin categorizar" repetida.
--
-- Fix: agregar la política *_cpa_read que falta, con el mismo patrón
-- exacto (auth.email() + account_members + role) que usan las otras ~20
-- tablas desde la migración 0003. De paso se agrega la misma cobertura
-- para Admin/Secretaria (acceso total mientras esté activo), que tenía el
-- mismo hueco aunque no se había notado todavía porque Admin trabaja
-- dentro del negocio del dueño con más frecuencia por otras rutas.
--
-- No hace falta backfill ni tocar ningún dato — nada está corrupto, solo
-- estaba oculto. En cuanto esta política se aplique, el Portal CPA debe
-- mostrar los nombres reales de categoría y colapsar correctamente en una
-- sola fila "Sin categorizar" para las transacciones genuinamente sin
-- categoría asignada.
-- ============================================================================

CREATE POLICY hacienda_categories_cpa_read ON hacienda_categories FOR SELECT USING (
  owner_id IS NULL
  OR owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM account_members am
    WHERE am.owner_id = hacienda_categories.owner_id
      AND am.member_email = auth.email()
      AND am.active = true
      AND am.role IN ('cpa', 'admin')
  )
);
