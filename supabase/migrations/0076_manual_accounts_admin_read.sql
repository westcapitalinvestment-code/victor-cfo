-- ============================================================================
-- 0076 — RLS: nivel Administrador puede leer manual_accounts (solo lectura),
-- igual que ya podía leer plaid_accounts (migración 0056).
-- ============================================================================
-- 8 sept 2026 — al construir Cuentas por entidad (conectar banco/cuenta
-- manual desde el tab de cada entidad, migración 0075), la página de solo
-- lectura del Admin (/admin/[entityId]/cuentas) se quedó mostrando SOLO
-- las cuentas de Plaid — nunca hubo política RLS que dejara a un
-- Administrador leer manual_accounts, así que aunque se añadiera la
-- consulta en el código, Postgres le devolvería 0 filas igual (RLS bloquea
-- antes de que la app se entere). Esta política cierra ese hueco, con el
-- mismo criterio exacto que plaid_accounts_admin_administrador_read:
-- solo SELECT, solo si la cuenta ya tiene entity_id asignado a la entidad
-- exacta del Administrador — nunca ve cuentas de otra entidad ni cuentas
-- personales (entity_id IS NULL) del dueño.
DROP POLICY IF EXISTS manual_accounts_admin_administrador_read ON manual_accounts;
CREATE POLICY manual_accounts_admin_administrador_read ON manual_accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = manual_accounts.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND manual_accounts.entity_id IS NOT NULL AND manual_accounts.entity_id = am.entity_id)
);
