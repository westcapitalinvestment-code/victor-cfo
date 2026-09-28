-- Cobro Rápido con QR (28 sept 2026, pedido de Joel: "que ningún cliente se
-- vaya sin pagar porque la plataforma no soporte algo") — añade soporte real
-- de ATH Móvil Business vía el Payment Button API de Evertec (además de
-- Stripe/tarjeta, que ya existía). El Public Token es el identificador que
-- Evertec asigna a la cuenta ATH Business del usuario — se configura en la
-- app de ATH Business → Ajustes → Configuración de Ecommerce, y se usa del
-- lado del navegador (no es secreto, similar a una publishable key de
-- Stripe) para abrir el botón/modal de pago real.
alter table public.business_entities
  add column if not exists ath_movil_public_token text;
