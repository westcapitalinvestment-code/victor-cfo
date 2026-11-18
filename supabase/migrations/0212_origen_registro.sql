-- 0212 — De dónde vino cada registro (18 nov 2026, pedido de Joel).
-- Para comparar anuncios (gratis / Core / negocio) y, más adelante, los
-- enlaces por cooperativa (victorcfo.com/?coop=yaucoop). Se llena una sola
-- vez, al crear la cuenta, desde la cookie vc_origen (primer toque) que
-- guarda app/origen-tracker.tsx. Lo escribe solo el servidor (service role).
alter table public.users
  add column if not exists origen jsonb,
  add column if not exists origen_cooperativa text;

create index if not exists users_origen_cooperativa_idx
  on public.users (origen_cooperativa)
  where origen_cooperativa is not null;

comment on column public.users.origen is
  'Primer toque antes de registrarse: utm_source, utm_medium, utm_campaign, utm_content, utm_term, coop, landing, referrer, capturado_en.';
comment on column public.users.origen_cooperativa is
  'Cooperativa que refirió al usuario (slug del enlace ?coop=), si aplica.';
