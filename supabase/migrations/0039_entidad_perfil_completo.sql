-- ============================================================================
-- VICTOR CFO — 0039: columnas que faltaban en business_entities para el
-- wizard/configuración completa de entidad (pantalla Perfil/Fiscal/Facturas
-- calcada de "VICTOR — Dashboard Pro.html" → sección Configuración).
-- ============================================================================
-- 0005 ya trajo lo esencial de facturación (invoice_prefix, payment_methods,
-- etc.) y lo fiscal orientado a CUANDO ESTA ENTIDAD LE PAGA A OTROS
-- (default_contractor_retention_pct). Lo que faltaba era: más datos de
-- contacto (zip, email, website — "municipio" de 0001 ya cubre la ciudad,
-- no hace falta duplicarla) y la retención que a ESTA ENTIDAD le retienen
-- SUS CLIENTES al pagarle (dirección contraria a la de 0005) — son dos
-- cosas distintas, por eso es una columna nueva y no se reutiliza
-- default_contractor_retention_pct.
-- ============================================================================

ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS zip text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS website text,
  -- no | 10 | 6 | exento — retención que los CLIENTES le aplican a esta
  -- entidad al pagarle (no confundir con default_contractor_retention_pct,
  -- que es al revés: lo que esta entidad retiene a SUS contratistas).
  ADD COLUMN IF NOT EXISTS client_retention_situation text DEFAULT 'no',
  ADD COLUMN IF NOT EXISTS relevo_certificate_expiry date,
  ADD COLUMN IF NOT EXISTS relevo_certificate_r2_key text,
  ADD COLUMN IF NOT EXISTS invoice_footer text;
-- ============================================================================
