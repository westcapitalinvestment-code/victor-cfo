-- ============================================================================
-- VICTOR CFO — 0111: tabla native_push_tokens (30 sept 2026, empacar la app
-- en App Store/Google Play — pedido de Joel).
-- ============================================================================
-- APARTE de push_subscriptions (Web Push/VAPID, que sigue sirviendo para la
-- PWA en el navegador): cuando VICTOR CFO corre DENTRO de la app nativa
-- (Capacitor), el sistema operativo entrega un token distinto —APNs en
-- iOS, FCM en Android— vía @capacitor/push-notifications. No es el mismo
-- "shape" que un endpoint+p256dh+auth de Web Push, así que vive en su
-- propia tabla en vez de forzarlo dentro de push_subscriptions.
-- ============================================================================

CREATE TABLE native_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  token text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (owner_id, token)
);

ALTER TABLE native_push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY native_push_tokens_access ON native_push_tokens FOR ALL USING (
  owner_id = auth.uid()
);

GRANT ALL ON native_push_tokens TO authenticated;
