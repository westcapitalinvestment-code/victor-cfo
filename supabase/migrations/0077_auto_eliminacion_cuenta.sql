-- ============================================================================
-- 0077 — Auto-eliminación de cuenta (self-service), tarea #81.
-- ============================================================================
-- 8 sept 2026 — decisiones de Joel para este flujo (no son un simple
-- borrado inmediato):
--   1. La suscripción de Stripe se cancela AL FINAL del período ya pagado
--      (cancel_at_period_end), no de inmediato — el usuario ya pagó ese
--      tiempo, lo termina de usar.
--   2. La cuenta NO se borra al instante — queda "archivada" con un plazo
--      de gracia de 30 días (deletion_scheduled_for). Si fue un error, el
--      usuario puede cancelar la eliminación él mismo desde Configuración
--      mientras esté dentro de esos 30 días, o escribiendo a soporte.
--   3. Al cumplirse el plazo, un cron borra TODO excepto los registros de
--      facturación/pagos ya emitidos (facturas, pagos a contratistas) —
--      esos se conservan porque la Política de Privacidad ya promete
--      conservar lo que haya obligación legal/contable de guardar, y
--      Hacienda puede pedir esos registros años después.
--   4. Técnicos/Admin/Secretaria/CPA vinculados a la cuenta se desactivan
--      de inmediato al pedir la eliminación (no esperan los 30 días).
--
-- deactivated_by_deletion existe para poder deshacer la eliminación sin
-- reactivar por error a alguien que ya estaba inactivo por otra razón
-- ANTES de que se pidiera la eliminación.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_for timestamptz;

-- Se llena cuando el cron de purga (app/api/cron/purgar-cuentas-eliminadas)
-- ya borró todo lo que había que borrar de esta cuenta — sirve para no
-- reprocesarla en la siguiente corrida (idempotencia) y para que soporte
-- pueda confirmar que una cuenta ya fue purgada de verdad.
ALTER TABLE users ADD COLUMN IF NOT EXISTS purged_at timestamptz;

ALTER TABLE account_members ADD COLUMN IF NOT EXISTS deactivated_by_deletion boolean NOT NULL DEFAULT false;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS deactivated_by_deletion boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled_for ON users (deletion_scheduled_for) WHERE deletion_scheduled_for IS NOT NULL;
