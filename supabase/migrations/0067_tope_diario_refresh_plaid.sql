-- ============================================================================
-- VICTOR CFO — 0067: tope diario de transactionsRefresh por plan (4 sept
-- 2026, pedido de Joel).
--
-- Root cause: lib/plaid-sync.ts llamaba transactionsRefresh() sin ningún
-- freno, para TODOS los planes (Core y Pro), tanto desde el cron de las 2
-- corridas diarias como desde el botón manual "Sincronizar" — sin límite en
-- este último. Cada llamada de refresh le cuesta $0.15 a Plaid sin importar
-- si el banco trae algo nuevo o no (ver el Order Form Q-59177 que Joel
-- firmó). Un usuario dándole click repetido al botón podía generar cargos
-- ilimitados.
--
-- Acuerdo con Joel: Core nunca fuerza refresh — solo usa transactionsSync
-- (lee lo que Plaid ya tiene en su propia caché, gratis). Pro tiene un cupo
-- diario: 2/día base (cubre las 2 corridas del cron nocturno) + 2/día extra
-- por cada entidad de negocio adicional que paga ($24.99/mes c/u, ver
-- users.addon_entidades_seats de la migración 0063) — "si tiene otra
-- entidad... pues 2 más".
--
-- El contador se lleva por USUARIO, no por banco conectado: una
-- sincronización con 3 bancos conectados gasta 1 del cupo diario, no 3 (ver
-- lib/plaid-sync.ts). Se resetea solo — no hay cron de limpieza, la fecha
-- guardada simplemente deja de coincidir con "hoy" y el contador vuelve a 0.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS plaid_refresh_count integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plaid_refresh_count_fecha date;
