-- ============================================================================
-- VICTOR CFO — 0005: columnas que le faltaban a business_entities para
-- guardar todo lo que pide el wizard "Nueva entidad" (4 pasos) del mockup
-- VICTOR Pro — Producto Completo_FINAL.html.
-- ============================================================================
-- 0001 ya traía lo fiscal esencial (ein, entity_type, ivu_applies,
-- ivu_rate_estatal/municipal). Lo que faltaba era todo lo de identidad de
-- contacto (paso 1) y preferencias de facturación (paso 3). Todas las
-- columnas son opcionales/con default — no rompe las entidades que ya
-- existan.
-- ============================================================================

ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS tax_regime text DEFAULT 'ordinaria',        -- ordinaria | decreto_14_2017 | act60_cap3 | act60_cap2
  ADD COLUMN IF NOT EXISTS default_contractor_retention_pct numeric DEFAULT 10, -- 10 | 6 | 0 (paso 2, aplica de default a vendors nuevos)
  ADD COLUMN IF NOT EXISTS invoice_prefix text DEFAULT 'INV',
  ADD COLUMN IF NOT EXISTS invoice_start_number integer DEFAULT 1001,
  ADD COLUMN IF NOT EXISTS default_payment_terms text DEFAULT 'Net 30',
  ADD COLUMN IF NOT EXISTS default_late_fee text DEFAULT 'Sin recargo',
  ADD COLUMN IF NOT EXISTS payment_methods jsonb DEFAULT '["stripe"]'::jsonb;
-- ============================================================================
