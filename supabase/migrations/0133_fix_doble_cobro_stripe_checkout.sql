-- ============================================================================
-- VICTOR CFO — 0133: fix doble cobro de Stripe Checkout (2 oct 2026,
-- caso real: Dr. Serrano pagó $480 dos veces, 3 minutos aparte).
--
-- ROOT CAUSE #1 (datos): invoices.stripe_payment_intent se usaba para DOS
-- cosas distintas — resolverLinkCobro() (lib/stripe-connect-checkout.ts)
-- guardaba ahí el ID de la Checkout SESSION (cs_...) mientras se esperaba
-- el pago, y el webhook (app/api/stripe-connect/webhook/route.ts) guardaba
-- ahí el ID del PAYMENT INTENT (pi_...) una vez pagada. Si alguien volvía
-- a abrir el link de pago después de que la sesión vieja ya no servía,
-- resolverLinkCobro pisaba el valor bueno del webhook con uno nuevo de
-- sesión — por eso en el caso real ni stripe_charge_id ni fee_real
-- quedaron guardados, y no se pudo saber con certeza desde la base de
-- datos cuál de los 2 pagos reales era "el bueno".
--
-- ROOT CAUSE #2 (el doble cobro en sí): resolverLinkCobro() solo evitaba
-- generar un link de pago nuevo si invoices.estado YA decía "pagada" en
-- NUESTRA base de datos — pero el webhook que pone ese estado tarda unos
-- segundos en procesar. Si el cliente abría el link de pago de nuevo
-- dentro de esa ventana (estado todavía "enviada" en Supabase aunque el
-- cobro YA se había completado en Stripe), la función no se enteraba y
-- generaba una sesión de cobro nueva — segundo cobro real.
--
-- FIX: separar el campo (stripe_checkout_session_id, solo para la sesión
-- mientras se espera el pago) de stripe_payment_intent (solo para el pago
-- ya confirmado, que solo toca el webhook) — y antes de crear una sesión
-- nueva, resolverLinkCobro ahora pregunta a STRIPE directamente (no solo a
-- nuestra base de datos) si la sesión guardada ya se pagó — si Stripe dice
-- que sí, no genera una sesión nueva aunque nuestro estado todavía no haya
-- alcanzado a actualizarse.
-- ============================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

COMMENT ON COLUMN invoices.stripe_checkout_session_id IS
  'ID de la Stripe Checkout Session (cs_...) mientras se espera el pago — lo escribe únicamente resolverLinkCobro() en lib/stripe-connect-checkout.ts. No confundir con stripe_payment_intent, que es el pago YA confirmado y solo lo escribe el webhook.';

COMMENT ON COLUMN invoices.stripe_payment_intent IS
  'ID del Payment Intent (pi_...) de un pago YA confirmado — lo escribe únicamente el webhook de checkout.session.completed. Antes del 2 oct 2026 este campo se compartía por error con el ID de la sesión en progreso (ver stripe_checkout_session_id) — eso causó que un reintento de pago pisara el dato bueno y, en un caso real, que no se pudiera identificar cuál de 2 cobros duplicados era el legítimo.';
