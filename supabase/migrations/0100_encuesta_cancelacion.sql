-- 0100_encuesta_cancelacion.sql
-- 27 sept 2026, pedido de Joel: el correo automático de cancelación
-- (#698, migración anterior no la necesitó porque solo mandaba texto)
-- ahora incluye un link a una encuesta real con opciones que se pueden
-- marcar + caja de comentario, en vez de pedir "responde este correo".
--
-- cancellation_survey_token es el token de un solo uso que identifica al
-- usuario en /encuesta-cancelacion sin exponer su user id real en la URL
-- del correo. Se genera al cancelar (ver app/api/stripe/webhook/route.ts)
-- y se borra (se pone NULL) en cuanto se usa una vez — así el link del
-- correo deja de funcionar después de enviarse, evitando que alguien lo
-- reenvíe o lo reuse por error.
alter table public.users
  add column if not exists cancellation_survey_token text;

create unique index if not exists users_cancellation_survey_token_idx
  on public.users (cancellation_survey_token)
  where cancellation_survey_token is not null;
