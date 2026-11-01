-- ============================================================================
-- VICTOR CFO — 0198: Avisos oficiales marcados como "visto" — 1 nov 2026
-- ============================================================================
-- Pedido de Joel: que el banner de Avisos oficiales se pueda quitar una vez
-- visto. Cada usuario archiva los suyos; los archivados se pueden reabrir
-- desde el mismo banner. Requiere 0196 (avisos_oficiales).
-- ============================================================================
create table if not exists public.avisos_vistos (
  user_id uuid not null references auth.users(id) on delete cascade,
  aviso_id uuid not null references public.avisos_oficiales(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, aviso_id)
);

alter table public.avisos_vistos enable row level security;

drop policy if exists avisos_vistos_propios_select on public.avisos_vistos;
create policy avisos_vistos_propios_select on public.avisos_vistos
  for select using (user_id = auth.uid());

drop policy if exists avisos_vistos_propios_insert on public.avisos_vistos;
create policy avisos_vistos_propios_insert on public.avisos_vistos
  for insert with check (user_id = auth.uid());

drop policy if exists avisos_vistos_propios_delete on public.avisos_vistos;
create policy avisos_vistos_propios_delete on public.avisos_vistos
  for delete using (user_id = auth.uid());

comment on table public.avisos_vistos is
  'Avisos oficiales que cada usuario marcó como vistos (se ocultan del banner; se pueden restaurar).';
