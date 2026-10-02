-- ============================================================================
-- VICTOR CFO — 0134: Addon "Pagos" como subscription item real en Stripe
-- (2 oct 2026, pedido de Joel: sacar Pagos de lo incluido en VICTOR Pro y
-- venderlo aparte por $24.99/mes — "la parte de Pagos es un monstruo aparte
-- y de mucho valor"). Mismo patrón EXACTO que el addon Equipo/Técnicos
-- (migración 0050): un SEGUNDO subscription item plano (no por seat) sobre
-- la misma suscripción Pro — se activa/desactiva entero, no tiene tope de
-- cantidad como Secretaria/Administrador/Entidades.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_pagos_status text DEFAULT 'inactivo'; -- inactivo | activo
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_pagos_item_id text; -- subscription item id en Stripe, para poder desactivarlo
