-- ============================================================================
-- VICTOR CFO — 0099: crédito de referido pendiente para plan gratis
-- ============================================================================
-- Hasta ahora el programa de referidos ("Refiere y ahorra", migración 0031/
-- 0062) solo premiaba al referidor si YA estaba pagando — si estaba en plan
-- gratis, cuando su referido pagaba, no había factura de Stripe a la cual
-- aplicarle un crédito, así que simplemente no se registraba nada (ver
-- comentario viejo en procesarCreditoReferido, app/api/stripe/webhook/route.ts).
--
-- Pedido de Joel (25 sept 2026): "le podemos enviar el mensaje de fulano
-- que referiste acaba de hacer su pago... tienes $$$ ahora puedas activar
-- tu plan, y una fecha para que lo use, sino pues los pierde — esa es la
-- idea que siga refiriendo y le salga gratis a él". Y aclaró después: el
-- usuario SÍ tiene que pasar por Stripe y poner su tarjeta para activarlo —
-- el crédito no es un regalo sin compromiso, es un trial extendido: se
-- convierte en más días de trial_period_days al hacer checkout (ver
-- app/api/stripe/checkout/route.ts), y si deja de referir y no cancela
-- antes de que se acabe el trial, Stripe le cobra normal — mismo mecanismo
-- de siempre, solo con un trial más largo.
--
-- Estas 3 columnas nuevas distinguen ese caso del crédito normal (que se
-- aplica de una vez como balance transaction en Stripe):
--   pendiente_activacion — true = referidor era gratis cuando se ganó el
--     crédito, todavía no lo ha canjeado activando un plan.
--   expires_at — 30 días desde que se otorgó (pedido explícito de Joel:
--     "una fecha para que lo use, sino los pierde") — si el usuario no
--     activa un plan antes de esta fecha, el crédito queda huérfano (no se
--     borra la fila, por auditoría, pero /api/stripe/checkout ya no lo
--     cuenta al sumar créditos disponibles).
--   redeemed_at — cuándo se canjeó de verdad (se sumó a trial_period_days
--     en un checkout real) — NULL = todavía disponible (si no ha vencido).
-- Las filas del crédito normal (ya aplicado por Stripe balance transaction)
-- se insertan con pendiente_activacion=false y redeemed_at=created_at (ya
-- "canjeado" en el mismo momento), para que ambos tipos convivan en la
-- misma tabla sin ambigüedad sobre cuáles ya se usaron.
-- ============================================================================

alter table public.referral_rewards
  add column if not exists pendiente_activacion boolean not null default false,
  add column if not exists expires_at timestamptz,
  add column if not exists redeemed_at timestamptz;

comment on column public.referral_rewards.pendiente_activacion is
  'true = el referidor estaba en plan gratis cuando se otorgó este crédito — se canjea como días extra de trial en el checkout, no como balance de Stripe (no tiene factura todavía).';
comment on column public.referral_rewards.expires_at is
  'Fecha límite para canjear un crédito pendiente_activacion (30 días desde created_at). NULL para créditos normales (ya aplicados, no expiran).';
comment on column public.referral_rewards.redeemed_at is
  'Cuándo se canjeó de verdad el crédito. Para créditos normales, igual a created_at (se aplica de una vez). Para pendiente_activacion, NULL hasta que el usuario activa un plan de pago dentro de los 30 días.';
