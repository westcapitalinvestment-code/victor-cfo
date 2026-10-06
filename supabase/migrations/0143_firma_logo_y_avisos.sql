-- 0143 (6 oct 2026, pedido de Joel): logo de la firma de contadores + aviso
-- semanal a clientes liberados que siguen en periodo de gracia.
--
-- firma_logo_r2_key: logo que sube el contador (Firma Accountant) desde el
--   engranaje del Portal CPA; lo ven sus clientes invitados en el topbar.
-- firma_gracia_ultimo_aviso_at: cuándo se envió el último correo de gracia
--   (el de "te liberaron" o un recordatorio) — el cron firma-gracia reenvía
--   cada 7 días mientras no contrate su plan.
alter table users
  add column if not exists firma_logo_r2_key text,
  add column if not exists firma_gracia_ultimo_aviso_at timestamptz;

comment on column users.firma_logo_r2_key is 'Key en R2 del logo de la firma de contadores (Firma Accountant).';
comment on column users.firma_gracia_ultimo_aviso_at is 'Último correo de gracia enviado a un cliente liberado por su firma.';
