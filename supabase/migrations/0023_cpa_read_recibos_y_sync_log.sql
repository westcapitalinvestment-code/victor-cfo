-- ============================================================================
-- VICTOR CFO — 0023: cerrar el último hueco de lectura del CPA.
-- ============================================================================
-- CONTEXTO: al construir el portal completo del CPA (bóveda de recibos +
-- historial de auditoría), salió que 0003 le dio SELECT al CPA en casi todas
-- las tablas del schema, pero se quedaron fuera DOS que hacían falta para
-- esas dos pestañas: pending_receipts (bóveda de recibos) y
-- transaction_sync_log (el historial de "el banco corrigió esta transacción",
-- de la migración 0022). Sin esto, la pestaña de Recibos y la de Auditoría
-- del portal CPA se verían vacías para el contable aunque el dueño sí tenga
-- datos ahí. Mismo patrón que 0003: dueño+admin (ya cubierto, no se toca) vs
-- cpa (solo SELECT, nuevo).
--
-- CÓMO CORRERLO: pega este archivo completo en el SQL Editor de Supabase y
-- dale Run una sola vez.
-- ============================================================================

-- pending_receipts (bóveda de recibos) — mismo patrón que transactions_cpa_read
-- en 0003: filtra directo por owner_id porque la tabla no depende de una
-- entidad específica para el acceso del CPA (igual que transactions).
CREATE POLICY pending_receipts_cpa_read ON pending_receipts FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = pending_receipts.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- transaction_sync_log (historial de correcciones de Plaid, migración 0022)
CREATE POLICY transaction_sync_log_cpa_read ON transaction_sync_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = transaction_sync_log.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa')
);

-- ============================================================================
-- FIN 0023. Con esto, TODAS las tablas relevantes para el portal CPA (IVU,
-- reconciliación, recibos, retenciones/480, facturas, exenciones, estimados,
-- auditoría, sync log) ya tienen su política *_cpa_read de solo lectura.
-- ============================================================================
