-- Bienvenida automática al registro, pague o no (21 sept 2026, pedido de
-- Joel: "hay que crear una estrategia para que se envien cuando se
-- registre el cliente pague o no — si ya pagó se lo merece y si no pagó lo
-- motiva a pagar"). Hasta ahora el único email de bienvenida salía en el
-- webhook de Stripe (checkout.session.completed) — alguien que se registra
-- en el plan gratis, o que abandona el checkout de Stripe sin pagar, nunca
-- recibía nada.
--
-- Esta columna es la guarda de idempotencia: la ruta pública
-- /api/registro/bienvenida-inicial (llamada desde app/registro/page.tsx
-- justo después de signUp(), y desde app/auth/callback/route.ts tras OAuth)
-- no tiene sesión todavía en el camino de "confirma tu correo primero", así
-- que no puede protegerse con auth.getUser() — se protege con esto: solo
-- manda una vez por usuario, sin importar cuántas veces se llame la ruta.
alter table public.users
  add column if not exists bienvenida_registro_enviada_at timestamptz;

comment on column public.users.bienvenida_registro_enviada_at is
  'Cuándo se mandó el email de bienvenida inicial (gratis o "casi terminas" de pago) tras el registro. NULL = todavía no se manda. Independiente del email rico de Core/Pro que manda el webhook de Stripe al completar el pago.';
