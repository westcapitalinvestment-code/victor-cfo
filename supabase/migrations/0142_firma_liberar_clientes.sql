-- Joel (6 oct 2026): gestión de clientes de Firma Accountant.
-- La firma puede "liberar" a un cliente invitado (deja de pagarle el plan) o
-- cancelar una invitación pendiente; el cliente puede asumir su propio plan.
-- Al liberar, el cliente conserva Business y todos sus datos durante un
-- período de gracia (30 días) para poner su propia tarjeta; si no lo hace,
-- baja a plan 'gratis' (cron /api/cron/firma-gracia). Nunca se borran datos.
alter table public.users
  add column if not exists firma_gracia_hasta timestamptz,
  add column if not exists firma_liberado_de_id uuid references public.users(id) on delete set null;

comment on column public.users.firma_gracia_hasta is
  'Si no es NULL, el cliente fue liberado por su firma y conserva Business hasta esta fecha. Se limpia al contratar su propio plan; el cron lo baja a gratis al vencer.';
comment on column public.users.firma_liberado_de_id is
  'Firma que lo liberó (para mostrar el nombre en el aviso de gracia).';

-- firma_invitaciones.status ahora también admite 'cancelled' (la firma
-- canceló la invitación pendiente) — la columna es text sin CHECK.
