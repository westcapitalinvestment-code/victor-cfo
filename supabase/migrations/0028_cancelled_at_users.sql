-- ============================================================================
-- VICTOR CFO — 0028: guardar CUÁNDO se cancela una cuenta
-- ============================================================================
-- users.plan_status ya cambia a 'cancelled' cuando Stripe manda
-- customer.subscription.deleted (ver app/api/stripe/webhook/route.ts), pero
-- nunca se guardaba LA FECHA en que pasó eso — solo el estado actual. Sin
-- esa fecha no se puede calcular "cancelaciones este mes" ni churn rate en
-- el Dashboard de Operaciones, porque no hay forma de saber si una cuenta
-- cancelada lo hizo hoy o hace 3 meses.
-- ============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
