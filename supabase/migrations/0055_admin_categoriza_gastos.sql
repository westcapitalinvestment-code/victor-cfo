-- ============================================================================
-- VICTOR CFO — 0055: Admin/Secretaria puede CATEGORIZAR gastos, no solo verlos
-- ============================================================================
-- Contexto (2 sept 2026): en la migración 0054, el toggle 'ver_gastos' solo
-- daba SELECT — la idea original era "que vea los gastos del negocio". Pero
-- Joel aclaró el caso de uso real: "el Dr no tiene tiempo de hacer facturas,
-- recibos, categorizar etc — ahí entra la secre/adm". Es decir, categorizar
-- transacciones es parte del trabajo que el admin/secretaria debe poder
-- hacer, no solo mirar. Esta migración añade una política de UPDATE que
-- reusa el MISMO toggle 've_gastos' (no hace falta un toggle nuevo — quien
-- puede ver los gastos del negocio, los puede categorizar).
--
-- Alcance deliberadamente angosto: la política de UPDATE no da acceso a
-- INSERT ni DELETE — un admin/secretaria nunca crea ni borra una
-- transacción a mano, solo le puede poner categoría a las que ya existen
-- (igual que hace hoy /api/transacciones/categorizar para el dueño).
-- ============================================================================

DROP POLICY IF EXISTS transactions_admin_categorize ON transactions;
CREATE POLICY transactions_admin_categorize ON transactions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = transactions.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND COALESCE(am.permissions->>'ver_gastos', 'false') = 'true')
) WITH CHECK (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = transactions.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND COALESCE(am.permissions->>'ver_gastos', 'false') = 'true')
);
