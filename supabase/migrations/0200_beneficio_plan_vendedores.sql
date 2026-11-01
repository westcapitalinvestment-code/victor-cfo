-- ============================================================================
-- VICTOR CFO — 0200: Beneficio de plan para vendedores (puntos) — 1 nov 2026
-- ============================================================================
-- Pedido de Joel: cada vendedor aprobado recibe un plan gratis de VICTOR
-- (Core, o Pro si tiene negocio) para conocer el producto y promocionarlo.
--   - 30 días de gracia desde que empieza.
--   - Después, para conservarlo necesita 3 puntos al mes. Cada cliente que
--     paga cuenta: Core = 1, Pro = 1.5, Business = 3.
--   - Los puntos de sobra se guardan como reserva (tope 12 meses = 36 pts).
--   - Si un cliente cancela antes de su 3er pago (el 30% se pierde), se le
--     restan esos puntos.
--   - Para subir de plan, paga la diferencia con su propia suscripción.
-- El plan se aplica a la cuenta de VICTOR que tenga el MISMO email que el
-- vendedor. Lo corre el cron diario /api/cron/beneficio-vendedores.
-- ============================================================================

ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS tiene_negocio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beneficio_inicio_at timestamptz,
  ADD COLUMN IF NOT EXISTS puntos_reserva numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beneficio_mes text,
  ADD COLUMN IF NOT EXISTS beneficio_estado text NOT NULL DEFAULT 'pendiente'
    CHECK (beneficio_estado IN ('pendiente', 'gracia', 'activo', 'inactivo'));

ALTER TABLE public.socios_vendedor_clientes
  ADD COLUMN IF NOT EXISTS puntos numeric(4,1),
  ADD COLUMN IF NOT EXISTS puntos_revertidos boolean NOT NULL DEFAULT false;

-- Marca de origen del plan en la cuenta del usuario ('vendedor' = regalado
-- por este programa, sin suscripción de Stripe).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan_origen text;

-- Los vendedores que ya estaban aprobados empiezan sus 30 días de gracia hoy.
UPDATE public.socios
   SET beneficio_inicio_at = now()
 WHERE tipo = 'vendedor' AND estado = 'aprobado' AND beneficio_inicio_at IS NULL;

-- Los clientes que ya existían NO dan puntos retroactivos (0 = ya contados).
UPDATE public.socios_vendedor_clientes SET puntos = 0 WHERE puntos IS NULL;
