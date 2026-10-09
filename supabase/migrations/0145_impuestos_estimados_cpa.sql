-- 0145 — El contable (CPA) puede LEER la configuración de impuestos estimados
-- de sus clientes (9 oct 2026, pedido de Joel: "que el contable sepa lo que el
-- cliente adeuda y tiene que pagar para que él pase menos trabajo").
--
-- Solo lectura, mismo patrón que transactions_cpa_read (0003): el CPA ve las
-- filas de los dueños que lo invitaron (account_members role='cpa' activo).
-- Los tramos (tax_brackets / tax_params) ya son de lectura para cualquier
-- usuario autenticado (0144) y hacienda_categories es de lectura pública.

DROP POLICY IF EXISTS tax_estimate_settings_cpa_read ON tax_estimate_settings;
CREATE POLICY tax_estimate_settings_cpa_read ON tax_estimate_settings FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = tax_estimate_settings.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);
