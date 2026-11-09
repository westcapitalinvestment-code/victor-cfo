-- ============================================================================
-- VICTOR CFO — 0209: Tipo de firma (contable / facturación) y acceso
-- automático del contable — 9 nov 2026
-- ============================================================================
-- Decisión de Joel (9 nov 2026):
--   - Firma CONTABLE que paga el plan de su cliente: al aceptar la
--     invitación, el contable recibe el mismo acceso de contable que da
--     "Invita a tu contable" (facturas, pagos, nómina, reportes y
--     documentos) en todas las entidades del cliente (account_members role='cpa', entity_id NULL =
--     todas, incluidas las que cree después). Lo PERSONAL queda apagado
--     (share_personal=false). El cliente lo ve en "Invita a tu contable →
--     Quién tiene acceso hoy" y lo puede limitar o quitar cuando quiera.
--   - Firma de FACTURACIÓN (ej. facturación médica): solo paga el plan, no
--     recibe ningún acceso. Si el cliente quiere, la invita aparte.
--   - NULL (firmas registradas antes de esta migración): se comporta como
--     antes, sin acceso automático, hasta que la firma escoja su tipo.
-- La lógica vive en app/api/firma/aceptar/route.ts.
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS firma_tipo text
    CHECK (firma_tipo IS NULL OR firma_tipo IN ('contable', 'facturacion'));
