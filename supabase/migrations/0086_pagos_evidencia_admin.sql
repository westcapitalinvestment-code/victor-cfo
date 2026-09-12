-- ============================================================================
-- VICTOR CFO — 0086: evidencia de Pagos accesible para el Administrador
-- (12 sept 2026, pedido de Joel: "se supone que el admin y secre lo puedan
-- ver por si le dan los permisos pueda hacer pagos con evidencia").
-- ============================================================================
-- vendor_retencion_attachments (migración 0085) solo tenía la policy
-- owner-only, calcada de invoice_attachments — pero a diferencia de
-- Facturación, Pagos SÍ tiene ya un patrón cross-user real para su tabla
-- padre (vendor_retenciones_admin_administrador, migración 0056). Sin esta
-- policy, un Administrador podía crear/ver pagos pero nunca su evidencia.
--
-- vendor_retencion_attachments no tiene entity_id propio, así que la policy
-- hace join a vendor_retenciones para sacarlo — mismo patrón exacto que
-- document_files_admin_administrador (0056) hace join a documents.
--
-- Alcance acordado con Joel: SOLO el nivel Administrador (igual que el resto
-- de Pagos hoy). No se crea ningún permiso nuevo para Secretaria — eso queda
-- pendiente como decisión de producto aparte si Joel lo pide más adelante.
-- ============================================================================

CREATE POLICY vendor_retencion_attachments_admin_administrador ON vendor_retencion_attachments FOR ALL USING (
  EXISTS (SELECT 1 FROM vendor_retenciones vr
          JOIN account_members am ON am.owner_id = vr.owner_id
          WHERE vr.id = vendor_retencion_attachments.vendor_retencion_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND vr.entity_id IS NOT NULL AND vr.entity_id = am.entity_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM vendor_retenciones vr
          JOIN account_members am ON am.owner_id = vr.owner_id
          WHERE vr.id = vendor_retencion_attachments.vendor_retencion_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'admin'
          AND am.admin_tier = 'administrador'
          AND vr.entity_id IS NOT NULL AND vr.entity_id = am.entity_id)
);
