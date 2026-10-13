-- ============================================================================
-- VICTOR CFO — 0151: Solicitud con currículum + documentos del vendedor
-- — 13 oct 2026
-- ============================================================================
-- Pedido de Joel: el candidato a vendedor debe poder (1) subir su currículum
-- en /socios, (2) recibir un correo con los próximos pasos, (3) ser revisado
-- por el equipo y, si se aprueba, (4) completar sus documentos (contrato +
-- datos de pago) desde un link privado antes de recibir su código/PIN.
--
-- El link privado reutiliza socios.payment_token (migración 0071).
-- ============================================================================

ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS resume_key text,
  ADD COLUMN IF NOT EXISTS resume_filename text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS tax_id_encrypted text,
  ADD COLUMN IF NOT EXISTS tax_id_last4 text,
  ADD COLUMN IF NOT EXISTS contrato_aceptado_at timestamptz,
  ADD COLUMN IF NOT EXISTS contrato_firma_nombre text,
  ADD COLUMN IF NOT EXISTS contrato_aceptado_ip text,
  ADD COLUMN IF NOT EXISTS documentos_completados_at timestamptz;
