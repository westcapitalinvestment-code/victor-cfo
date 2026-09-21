-- Agente de soporte por email (21 sept 2026, pedido de Joel: "crear un
-- agente que conteste lo que sea que esté en nuestro manual, ya si es algo
-- que no tenemos que lo derive a mi"). Cada correo que llega a
-- soporte@victorcfo.com (vía Resend Inbound) queda registrado aquí, sin
-- importar si VICTOR pudo contestarlo solo o si se escaló a Joel — sirve
-- como bitácora y para que Joel vea de un vistazo qué se está preguntando.
--
-- Tabla nueva, sin relación a ninguna otra (no todo correo entrante viene de
-- un usuario que tengamos identificado — puede ser un cliente de un
-- negocio, alguien que responde una factura, o spam).
create table if not exists public.soporte_conversaciones (
  id uuid primary key default gen_random_uuid(),
  de_email text not null,
  de_nombre text,
  asunto text,
  cuerpo text not null,
  resend_email_id text, -- id del correo entrante en Resend, para dedup si el webhook reintenta
  respondido boolean not null default false,
  respuesta text,
  escalado boolean not null default false,
  articulos_usados text[], -- slugs de manual_articulos que se usaron para responder (si aplica)
  error text, -- si algo falló al procesar (Claude, Resend, etc.)
  created_at timestamptz not null default now()
);

create index if not exists soporte_conversaciones_resend_email_id_idx
  on public.soporte_conversaciones (resend_email_id);

comment on table public.soporte_conversaciones is
  'Bitácora de correos entrantes a soporte@victorcfo.com procesados por el agente VICTOR CFO — respondidos solo o escalados a Joel.';

-- RLS activado SIN políticas permisivas a propósito — mismo patrón que el
-- resto de datos "solo founder" en este proyecto (ver app/dashboard/cfo/page.tsx):
-- ni el webhook (escribe) ni el Dashboard de Operaciones (si algún día lee
-- de aquí) pasan por un usuario autenticado normal, ambos usan
-- createAdminClient() (service_role), que ignora RLS. Esto solo cierra la
-- puerta a que cualquier cliente logueado pueda leer correos de soporte de
-- otra gente vía la API pública de Supabase.
alter table public.soporte_conversaciones enable row level security;
