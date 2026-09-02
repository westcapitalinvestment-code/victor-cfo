-- ============================================================================
-- VICTOR CFO — 0050: Addon "Equipo" (técnicos) como subscription item real
-- en Stripe, sobre la MISMA suscripción del plan Pro (2 sept 2026, pedido
-- de Joel: "Pro son $49.99 pero con los Addon sube de precio, Técnicos
-- $20.00 hasta 3 técnicos"). Se guarda en `users` (no por entidad) porque
-- el plan/suscripción ya vive a nivel de cuenta, igual que `plan` y
-- `plan_status`.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_tecnicos_status text DEFAULT 'inactivo'; -- inactivo | activo
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_tecnicos_item_id text; -- subscription item id en Stripe, para poder desactivarlo
