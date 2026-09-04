-- ============================================================================
-- VICTOR CFO — 0065: Stripe Connect (Standard) para cobro real con tarjeta en
-- Facturación. Pedido de Joel (3 sept 2026): "cobra por tarjeta" en el
-- landing describía algo que hoy NO existe de verdad — "Tarjeta" en
-- Registrar Pago es solo un dropdown que el usuario Pro marca a mano
-- después de cobrar por fuera. Esto construye el cobro real.
-- ============================================================================
-- Decisión de Joel: cuentas Standard (no Express/Custom) — cada usuario Pro
-- crea o conecta SU PROPIA cuenta de Stripe, con su propio dashboard, sus
-- propios depósitos y su propia relación directa con Stripe. VICTOR nunca
-- toca ese dinero — solo genera el link de cobro y escucha cuándo se paga.
-- SIN comisión de plataforma (decisión explícita de Joel: "no quiero cobrar
-- nada... mejor usarlo como ventaja" — se vende como "sin comisión extra de
-- VICTOR, solo lo que Stripe cobra").
--
-- Vive en business_entities (no en users) porque Facturación ya es
-- por-entidad (igual que ath_movil_business_path, migración 0052) — un
-- usuario Pro con varias entidades de negocio puede tener una cuenta de
-- Stripe distinta por cada una.
-- ============================================================================

ALTER TABLE business_entities
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS business_entities_stripe_connect_account_id_key
  ON business_entities (stripe_connect_account_id)
  WHERE stripe_connect_account_id IS NOT NULL;
