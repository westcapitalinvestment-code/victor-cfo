-- Contactos que arman su plan gratis en /trading/plan sin registrarse (24 nov 2026).
-- Solo el servidor (cliente admin) usa la tabla: RLS activo y sin políticas.
create table if not exists public.trading_leads (
  id bigserial primary key,
  email text not null,
  telefono text,
  respuestas jsonb not null default '{}'::jsonb,
  plan jsonb not null default '{}'::jsonb,
  utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists trading_leads_email_idx on public.trading_leads (lower(email), created_at desc);
alter table public.trading_leads enable row level security;
