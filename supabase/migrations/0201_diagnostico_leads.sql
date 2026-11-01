-- VICTOR CFO — 0201: leads del Diagnóstico de 30 segundos (/diagnostico) — 1 nov 2026
create table if not exists public.diagnostico_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  area text not null,
  puntajes jsonb,
  respuestas jsonb,
  socio_codigo text,
  origen text,
  created_at timestamptz not null default now()
);
create index if not exists diagnostico_leads_email_idx on public.diagnostico_leads (lower(email));
alter table public.diagnostico_leads enable row level security; -- sin policies: solo service role
