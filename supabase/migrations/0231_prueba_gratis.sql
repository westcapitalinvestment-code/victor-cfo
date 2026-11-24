-- Prueba de 7 días sin tarjeta para todos los planes (24 nov 2026).
-- prueba_hasta: fin de la prueba (Stripe trial_end); con esto la IA tiene tope
-- de $7 y el cron manda los correos de la prueba.
alter table public.users add column if not exists prueba_hasta timestamptz;
alter table public.users add column if not exists prueba_d1_at timestamptz;
alter table public.users add column if not exists prueba_d3_at timestamptz;
alter table public.users add column if not exists prueba_d5_at timestamptz;
notify pgrst, 'reload schema';
