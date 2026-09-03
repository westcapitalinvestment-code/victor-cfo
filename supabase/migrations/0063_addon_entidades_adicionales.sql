-- ============================================================================
-- VICTOR CFO — 0063: addon Entidades adicionales ($24.99/mes c/u), cobro real
-- ============================================================================
-- Gap real encontrado 3 sept 2026 (Joel armando Stripe: "falta el price de
-- entidades adic $24.99"). El texto "Entidad adicional — $24.99/mes." ya
-- existía en app/dashboard/entidades/entidad-form.tsx desde hace semanas,
-- pero era solo un LABEL — nunca se creó el subscription item real en
-- Stripe. Un usuario podía crear entidades ilimitadas gratis, sin que se le
-- cobrara nada más allá de la primera (incluida en Pro).
--
-- Mismo patrón que Admin/Secretaria (migración 0054/0056): cobro POR SEAT,
-- sincronizado con la cantidad real en vez de un botón activar/desactivar
-- aparte — ver app/api/stripe/addon-entidades/sincronizar/route.ts.
-- addon_entidades_seats = entidades de negocio ACTIVAS del usuario MENOS 1
-- (la primera va incluida en el plan Pro), nunca negativo.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_entidades_status text DEFAULT 'inactivo'; -- inactivo | activo
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_entidades_item_id text; -- id del subscription item en Stripe (cantidad = seats)
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_entidades_seats integer DEFAULT 0;
