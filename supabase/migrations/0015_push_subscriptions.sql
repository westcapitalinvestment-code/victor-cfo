-- ============================================================================
-- VICTOR CFO — 0015: tabla push_subscriptions — notificaciones push (Web
-- Push / VAPID) para la PWA instalada en el celular.
-- ============================================================================
-- Cada fila es UNA suscripción de push de UN dispositivo/navegador del
-- usuario (endpoint + llaves de cifrado que entrega el navegador al
-- suscribirse) — un mismo usuario puede tener varias si instala la PWA en
-- más de un celular, por eso no es una columna más de `users` sino su
-- propia tabla. Sin RLS de account_members a propósito: una notificación
-- push le suena EN EL DISPOSITIVO donde se suscribió, así que no tiene
-- sentido que un miembro de equipo vea/borre la suscripción de otro.
-- ============================================================================

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (owner_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subscriptions_access ON push_subscriptions FOR ALL USING (
  owner_id = auth.uid()
);

GRANT ALL ON push_subscriptions TO authenticated;
