-- 0196 — Avisos oficiales automáticos (30 oct 2026, pedido de Joel).
--
-- "Puente filtrado": un cron diario (/api/cron/avisos-oficiales) lee páginas
-- públicas de fuentes oficiales (Depto. del Trabajo, Hacienda, Colegio de CPA
-- de PR, IRS), descarta lo que no toca a lo que VICTOR cubre, resume lo que sí
-- (solo lo que dice la fuente, sin consejos) y lo publica aquí. Nadie del
-- equipo redacta ni aprueba nada: VICTOR CFO NO emite estos avisos, solo
-- filtra y enlaza lo que publican los portales oficiales.
--
-- avisos_vistos: todo lo que el cron ya revisó (relevante o no), para no
--   volver a procesarlo ni a gastar IA en lo mismo. También sirve de línea base
--   en la primera corrida de cada fuente (no avisa de lo viejo).
-- avisos_oficiales: lo que sí se muestra (banner en Inicio y Portal CPA) y de
--   donde salen el push/email para quienes aplica.

create table if not exists public.avisos_vistos (
  url text primary key,
  fuente text not null,
  titulo text,
  relevante boolean not null default false,
  visto_at timestamptz not null default now()
);
create index if not exists avisos_vistos_fuente_idx on public.avisos_vistos (fuente);

create table if not exists public.avisos_oficiales (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  fuente text not null,                 -- dtrh | hacienda | colegio_cpa_cartas | colegio_cpa_determinaciones | irs
  fuente_nombre text not null,
  titulo text not null,
  resumen text not null,
  fecha_publicacion date,
  fecha_limite date,
  temas text[] not null default '{}',   -- nomina | contratistas | ivu | estimadas | planillas | retiro | general_fiscal | federal | profesion
  urgencia text not null default 'media' check (urgencia in ('baja', 'media', 'alta')),
  publicado boolean not null default true,
  enviado_at timestamptz,               -- cuándo salieron push/email (null = aún no / no aplica)
  creado_at timestamptz not null default now()
);
create index if not exists avisos_oficiales_creado_idx on public.avisos_oficiales (creado_at desc);

alter table public.avisos_vistos enable row level security;      -- solo service_role
alter table public.avisos_oficiales enable row level security;

-- Cualquier usuario autenticado (dueños, contables, admin) puede LEER los
-- avisos publicados. Escribir: solo el cron (service_role se salta RLS).
drop policy if exists avisos_oficiales_lectura on public.avisos_oficiales;
create policy avisos_oficiales_lectura on public.avisos_oficiales
  for select to authenticated
  using (publicado = true);

comment on table public.avisos_oficiales is
  'Resúmenes automáticos de avisos publicados por fuentes oficiales (DTRH, Hacienda, Colegio de CPA, IRS). VICTOR CFO no los redacta ni emite; solo filtra y enlaza la fuente. Ver /api/cron/avisos-oficiales.';
