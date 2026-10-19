-- ============================================================================
-- VICTOR CFO — 0169: el contable (CPA) puede VER la nómina del cliente
-- (19 oct 2026, pedido de Joel: "la parte de Nómina debe ser compartida con el
-- portal del contable para que pueda ver lo que sube el cliente").
--
-- Solo lectura, mismo criterio que vendor_retenciones_cpa_read: el contable
-- activo en account_members (role 'cpa') del dueño. Los contables delegados de
-- una oficina entran por los triggers que ya sincronizan account_members.
-- Requiere 0167. No toca payroll_params (ya es de lectura general).
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_entity_config', 'payroll_employees', 'payroll_runs', 'payroll_run_lines']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_cpa_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = %I.owner_id AND am.member_email = auth.email() AND am.active = true AND am.role = ''cpa''))',
      t || '_cpa_read', t, t
    );
  END LOOP;
END $$;
