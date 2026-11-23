-- ============================================================================
-- VICTOR CFO — 0228: embudo propio (23 nov 2026), sin Pixel.
-- Cuenta los pasos de /trading → /registro → registro hecho, con utm_* y un id
-- anónimo de navegador. Solo se escribe desde /api/embudo (service role).
-- Para ver el embudo:
--   select evento, count(*) personas from (select distinct evento, sesion
--   from embudo_eventos where created_at > now() - interval '7 days') x
--   group by evento order by personas desc;
-- ============================================================================
CREATE TABLE IF NOT EXISTS embudo_eventos (
  id         bigserial PRIMARY KEY,
  evento     text NOT NULL,
  ruta       text,
  sesion     text,
  utm        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS embudo_eventos_fecha ON embudo_eventos (created_at DESC);
ALTER TABLE embudo_eventos ENABLE ROW LEVEL SECURITY;
-- Sin políticas: nadie la lee ni escribe desde el navegador; solo el servidor.
NOTIFY pgrst, 'reload schema';
