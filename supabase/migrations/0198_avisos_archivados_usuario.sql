-- ============================================================================
-- VICTOR CFO — 0198: Avisos oficiales marcados como "visto" — 1 nov 2026
-- ============================================================================
-- Pedido de Joel: que el banner de Avisos oficiales se pueda quitar una vez
-- visto. Cada usuario archiva los suyos; los archivados se pueden reabrir
-- desde el mismo banner. Requiere 0196 (avisos_oficiales). OJO: la tabla avisos_vistos ya existe (la usa el cron), por eso esta se llama distinto.
-- ============================================================================
create table if not exists public.avisos_archivados_usuario (
  user_id uuid not null references auth.users(id) on delete cascade,
  aviso_id uuid not null references public.avisos_oficiales(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, aviso_id)
);

alter table public.avisos_archivados_usuario enable row level security;

drop policy if exists avisos_archivados_usuario_propios_select on public.avisos_archivados_usuario;
create policy avisos_archivados_usuario_propios_select on public.avisos_archivados_usuario
  for select using (user_id = auth.uid());

drop policy if exists avisos_archivados_usuario_propios_insert on public.avisos_archivados_usuario;
create policy avisos_archivados_usuario_propios_insert on public.avisos_archivados_usuario
  for insert with check (user_id = auth.uid());

drop policy if exists avisos_archivados_usuario_propios_delete on public.avisos_archivados_usuario;
create policy avisos_archivados_usuario_propios_delete on public.avisos_archivados_usuario
  for delete using (user_id = auth.uid());

comment on table public.avisos_archivados_usuario is
  'Avisos oficiales que cada usuario marcó como vistos (se ocultan del banner; se pueden restaurar).';
