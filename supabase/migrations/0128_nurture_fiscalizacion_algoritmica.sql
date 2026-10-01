-- #792 (1 oct 2026, pedido de Joel) — 3er correo de la secuencia de nurture
-- para plan='gratis' (mismo patrón de 0098: una columna de idempotencia por
-- correo, para que el cron de app/api/cron/nurture-emails nunca lo reenvíe).
-- Se dispara día 8 desde el registro, después de día 2 (features gratis) y
-- día 5 (oferta de trial) — el ángulo aquí es distinto: no es "mira todo lo
-- que puedes hacer", es "Hacienda ya cruza tus datos automáticamente,
-- organízate antes de la notificación" (ver landing-page.tsx, sección
-- #fiscalizacion-algoritmica, con las fuentes reales de hacienda.pr.gov).
alter table users add column if not exists nurture_fiscalizacion_enviado_at timestamptz;
