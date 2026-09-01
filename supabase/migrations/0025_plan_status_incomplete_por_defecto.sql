-- ============================================================================
-- VICTOR CFO — 0025: nuevos registros empiezan en plan_status = 'incomplete'
--
-- Hasta hoy (23 agosto 2026), handle_new_user() (0002) crea la fila en
-- public.users SIN indicar plan_status, así que toma el DEFAULT de la
-- columna — que era 'trialing'. Eso le daba acceso completo y gratis a
-- cualquiera que se registrara, sin pasar por ningún cobro, porque el
-- checkout de Stripe todavía no existía.
--
-- Este cambio solo toca el DEFAULT de la columna — NO actualiza filas ya
-- existentes. Los usuarios actuales (todos en 'trialing' o lo que tengan
-- hoy) se quedan exactamente igual; a partir de ahora, solo los registros
-- NUEVOS nacen en 'incomplete', y el middleware los manda a completar el
-- pago antes de dejarlos entrar al dashboard. En cuanto el webhook de
-- Stripe confirma el pago (checkout.session.completed), pasa a 'active'.
-- ============================================================================

ALTER TABLE public.users ALTER COLUMN plan_status SET DEFAULT 'incomplete';
