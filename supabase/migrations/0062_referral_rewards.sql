-- ============================================================================
-- VICTOR CFO — 0062: crédito de referido para el que REFIERE (3 sept 2026)
-- ============================================================================
-- Pedido de Joel: "si un usuario refiere un amigo o colega recibe un
-- beneficio pero el que refiere no". El sistema de referidos (migración
-- 0031) solo beneficiaba al REFERIDO (descuento en Core, o el primer mes
-- gratis en Pro de la migración anterior) — nada para quien comparte el
-- link. Esta tabla es el registro de "a quién ya se le dio su crédito",
-- para que el webhook (case "invoice.paid" en
-- app/api/stripe/webhook/route.ts) nunca premie dos veces al mismo
-- referidor por el mismo referido, sin importar cuántas facturas pague
-- ese referido después.
--
-- Mecánica: cuando el referido paga su PRIMERA factura real (no en el
-- registro, no durante el trial gratis de Pro — solo cuando Stripe cobra
-- de verdad), el que lo refirió recibe un crédito en su propio saldo de
-- Stripe equivalente a un mes de SU plan actual (no del plan del
-- referido) — se aplica solo automáticamente contra su próxima factura.
-- Deliberadamente sin tope: si alguien refiere a 12 colegas y los 12
-- pagan, se gana 12 meses de crédito — 12 clientes nuevos pagando a
-- cambio de un mes de la suscripción de uno solo es un trato excelente
-- para el negocio, no hace falta limitarlo artificialmente.
--
-- Si el que refiere nunca ha pagado (plan gratis, sin stripe_customer_id
-- real), no se le da nada — no hay una factura a la cual aplicar el
-- crédito. Esto es consistente con la intención original de la 0031: el
-- descuento de referido siempre fue pensado como recompensa a quien ya
-- paga por traer gente, no un regalo en efectivo aparte.
-- ============================================================================

CREATE TABLE referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  credit_cents integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX referral_rewards_referrer_id_idx ON referral_rewards (referrer_id);

-- Tabla de bookkeeping interno (solo la escribe/lee el webhook con el
-- cliente admin) — sin políticas de RLS con USING, así que con RLS
-- encendido queda bloqueada para cualquier rol que no sea el service role.
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;
