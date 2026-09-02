-- ============================================================================
-- VICTOR CFO — 0056: Dos niveles de Admin/Secretaria + fix de fuga de datos
-- ============================================================================
-- Contexto (2 sept 2026): Joel pidió dividir "Admin/Secretaria" en dos
-- niveles de precio/acceso: Secretaria ($10/mes, el alcance que ya existe
-- desde 0054/0055 — Clientes, Facturas, Cobros + los 5 toggles) y
-- Administrador ($20/mes, para el caso real de "la esposa del Dr. que lleva
-- TODO el negocio" — además de Secretaria, acceso a Pagos/contratistas,
-- Metas de negocio, Bóveda de documentos y ver balances de Cuentas). Las
-- finanzas PERSONALES del dueño nunca son visibles a ningún nivel — eso no
-- cambia.
--
-- PARTE 1 fija una fuga real descubierta al diseñar esto: las políticas de
-- 0054/0055 sobre `transactions` (ver_gastos) y sobre `retenciones_hacienda`
-- (ver_creditos_hacienda) solo comprobaban `owner_id` — nunca `entity_id`.
-- Como `transactions.entity_id IS NULL` significa "transacción personal",
-- un admin con el toggle ver_gastos encendido podía leer (¡y con 0055,
-- categorizar!) las transacciones PERSONALES del dueño, y no solo las del
-- negocio al que fue invitado. Se corrige exigiendo
-- `entity_id = am.entity_id` (nunca NULL) en ambas políticas.
--
-- PARTE 2 añade la columna `admin_tier` a account_members/admin_invitations.
--
-- PARTE 3 añade políticas RLS NUEVAS, exclusivas del nivel Administrador,
-- para vendors/vendor_retenciones (Pagos), goals (Metas), documents/
-- document_files (Bóveda) y plaid_accounts de solo lectura (Cuentas) — todas
-- scoped a `entity_id = am.entity_id`, igual que el resto del sistema.
-- vendor_480_validation se deja fuera a propósito: ninguna pantalla la usa
-- todavía (ni siquiera la del dueño).
-- ============================================================================


-- ============================================================================
-- PARTE 1 — Fix de fuga: transacciones y créditos de Hacienda deben quedar
-- scoped a la ENTIDAD del admin, nunca a "todo lo del owner_id".
-- ============================================================================

DROP POLICY IF EXISTS transactions_admin_read_gastos ON transactions;
CREATE POLICY transactions_admin_read_gastos ON transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = transactions.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND COALESCE(am.permissions->>'ver_gastos', 'false') = 'true'
          AND transactions.entity_id IS NOT NULL
          AND transactions.entity_id = am.entity_id)
);

DROP POLICY IF EXISTS transactions_admin_categorize ON transactions;
CREATE POLICY transactions_admin_categorize ON transactions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = transactions.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND COALESCE(am.permissions->>'ver_gastos', 'false') = 'true'
          AND transactions.entity_id IS NOT NULL
          AND transactions.entity_id = am.entity_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = transactions.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND COALESCE(am.permissions->>'ver_gastos', 'false') = 'true'
          AND transactions.entity_id IS NOT NULL
          AND transactions.entity_id = am.entity_id)
);

DROP POLICY IF EXISTS retenciones_hacienda_admin_read_creditos ON retenciones_hacienda;
CREATE POLICY retenciones_hacienda_admin_read_creditos ON retenciones_hacienda FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = retenciones_hacienda.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND COALESCE(am.permissions->>'ver_creditos_hacienda', 'false') = 'true'
          AND retenciones_hacienda.entity_id IS NOT NULL
          AND retenciones_hacienda.entity_id = am.entity_id)
);


-- ============================================================================
-- PARTE 2 — Nivel de acceso: 'secretaria' (default, alcance actual) vs.
-- 'administrador' (alcance ampliado, ver PARTE 3).
-- ============================================================================

ALTER TABLE account_members
  ADD COLUMN IF NOT EXISTS admin_tier text NOT NULL DEFAULT 'secretaria'
  CHECK (admin_tier IN ('secretaria', 'administrador'));

ALTER TABLE admin_invitations
  ADD COLUMN IF NOT EXISTS admin_tier text NOT NULL DEFAULT 'secretaria'
  CHECK (admin_tier IN ('secretaria', 'administrador'));


-- ============================================================================
-- PARTE 3 — Acceso exclusivo del nivel Administrador. Todas las políticas
-- exigen am.admin_tier = 'administrador' Y que la fila pertenezca a la
-- ENTIDAD exacta a la que ese administrador fue invitado (am.entity_id) —
-- nunca "todo lo del owner_id", igual que el fix de PARTE 1.
-- ============================================================================

-- Pagos — vendors (contratistas)
DROP POLICY IF EXISTS vendors_admin_administrador ON vendors;
CREATE POLICY vendors_admin_administrador ON vendors FOR ALL USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = vendors.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND vendors.entity_id IS NOT NULL AND vendors.entity_id = am.entity_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = vendors.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND vendors.entity_id IS NOT NULL AND vendors.entity_id = am.entity_id)
);

-- Pagos — vendor_retenciones (corridas de pago)
DROP POLICY IF EXISTS vendor_retenciones_admin_administrador ON vendor_retenciones;
CREATE POLICY vendor_retenciones_admin_administrador ON vendor_retenciones FOR ALL USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = vendor_retenciones.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND vendor_retenciones.entity_id IS NOT NULL AND vendor_retenciones.entity_id = am.entity_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = vendor_retenciones.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND vendor_retenciones.entity_id IS NOT NULL AND vendor_retenciones.entity_id = am.entity_id)
);

-- Metas de negocio — goals
DROP POLICY IF EXISTS goals_admin_administrador ON goals;
CREATE POLICY goals_admin_administrador ON goals FOR ALL USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = goals.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND goals.entity_id IS NOT NULL AND goals.entity_id = am.entity_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = goals.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND goals.entity_id IS NOT NULL AND goals.entity_id = am.entity_id)
);

-- Bóveda — documents
DROP POLICY IF EXISTS documents_admin_administrador ON documents;
CREATE POLICY documents_admin_administrador ON documents FOR ALL USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = documents.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND documents.entity_id IS NOT NULL AND documents.entity_id = am.entity_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = documents.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND documents.entity_id IS NOT NULL AND documents.entity_id = am.entity_id)
);

-- Bóveda — document_files (sin entity_id propio, se valida vía su documento)
DROP POLICY IF EXISTS document_files_admin_administrador ON document_files;
CREATE POLICY document_files_admin_administrador ON document_files FOR ALL USING (
  EXISTS (SELECT 1 FROM documents d
          JOIN account_members am ON am.owner_id = d.owner_id
          WHERE d.id = document_files.document_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND d.entity_id IS NOT NULL AND d.entity_id = am.entity_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM documents d
          JOIN account_members am ON am.owner_id = d.owner_id
          WHERE d.id = document_files.document_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND d.entity_id IS NOT NULL AND d.entity_id = am.entity_id)
);

-- Cuentas — plaid_accounts, SOLO LECTURA (ver balances, nunca conectar/
-- editar/borrar un banco — eso sigue siendo exclusivo del dueño en
-- /dashboard/cuentas).
DROP POLICY IF EXISTS plaid_accounts_admin_administrador_read ON plaid_accounts;
CREATE POLICY plaid_accounts_admin_administrador_read ON plaid_accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = plaid_accounts.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND plaid_accounts.entity_id IS NOT NULL AND plaid_accounts.entity_id = am.entity_id)
);


-- ============================================================================
-- PARTE 4 — Columnas para el segundo subscription item de Stripe. El addon
-- "Admin/Secretaria" pasa a ser DOS seats por separado: las columnas
-- addon_admin_* (de 0054) se quedan tal cual y ahora representan el seat de
-- SECRETARIA ($10/mes); estas nuevas addon_administrador_* representan el
-- seat de ADMINISTRADOR ($20/mes) — dos subscription items independientes
-- en la misma suscripción de Stripe. Ver /api/stripe/addon-admin/sincronizar.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS addon_administrador_status text DEFAULT 'inactivo',
  ADD COLUMN IF NOT EXISTS addon_administrador_item_id text,
  ADD COLUMN IF NOT EXISTS addon_administrador_seats integer DEFAULT 0;
