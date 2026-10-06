-- Joel (6 oct 2026): ampliar la secuencia de nurture del plan gratis.
--  1) Correo guía "sube tu CSV/Excel y mira el dashboard" (día 3).
--  2) Tips semanales de VICTOR (estilo blog) desde el día 14, hasta agotar
--     la lista en lib/tips-victor.ts — hasta que el usuario convierta.
--  3) Baja de correos de marketing (necesaria para envíos recurrentes).
alter table public.users
  add column if not exists nurture_csv_guia_enviado_at timestamptz,
  add column if not exists nurture_tips_enviados integer not null default 0,
  add column if not exists nurture_tips_ultimo_at timestamptz,
  add column if not exists email_marketing_baja_at timestamptz;

comment on column public.users.nurture_tips_enviados is
  'Cuántos tips semanales (lib/tips-victor.ts) se han enviado. El próximo es el índice = este valor.';
comment on column public.users.email_marketing_baja_at is
  'Si no es NULL, el usuario se dio de baja de los correos de nurture/tips. Los crons no le escriben.';
