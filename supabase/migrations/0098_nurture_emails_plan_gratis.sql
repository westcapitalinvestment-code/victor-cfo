-- ============================================================================
-- VICTOR CFO — 0098: secuencia de nurture para plan gratis
-- ============================================================================
-- Pedido de Joel (25 sept 2026), tras ver que la campaña de Facebook casi no
-- convertía: ya que capturamos el email en el registro gratis (1 clic con
-- Google, ver app/registro/page.tsx), aprovechamos esa dirección para
-- convertir a Core/Pro con una secuencia corta en vez de dejar la cuenta
-- gratis en silencio:
--   Día 0 — bienvenida (ya existe, migración 0091/sendWelcomeGratisEmail)
--   Día 2 — qué puede hacer YA con lo gratis (CSV/Excel, Bóveda, Metas, Citas)
--   Día 5 — oferta de probar 7 días gratis lo de pago (banco + VICTOR)
--
-- Mismo patrón de idempotencia que bienvenida_registro_enviada_at (0091) y
-- recordatorio_onboarding_enviado (0093): una columna de timestamp por
-- correo, NULL = no se ha mandado. Solo aplica a plan='gratis' — quien ya
-- paga no necesita que lo convenzan de pagar.
-- ============================================================================

alter table public.users
  add column if not exists nurture_features_gratis_enviado_at timestamptz,
  add column if not exists nurture_trial_oferta_enviado_at timestamptz;

comment on column public.users.nurture_features_gratis_enviado_at is
  'Cuándo se mandó el email de día 2 (funciones que ya puede usar gratis: CSV/Excel, Bóveda, Metas, Citas). NULL = todavía no se manda. Solo aplica a plan=''gratis''.';

comment on column public.users.nurture_trial_oferta_enviado_at is
  'Cuándo se mandó el email de día 5 (oferta de probar 7 días gratis Core/Pro: banco conectado + chat con VICTOR). NULL = todavía no se manda. Solo aplica a plan=''gratis''.';
