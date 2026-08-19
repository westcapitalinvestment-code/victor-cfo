-- ============================================================================
-- VICTOR CFO — 0013: permisos de tabla para service_role.
-- ============================================================================
-- Mismo problema que 0004 (grants_tabla) pero para el rol service_role en
-- vez de authenticated: 0004 nunca le dio GRANT explícito a service_role
-- sobre las tablas — solo tenía TRUNCATE/REFERENCES/TRIGGER por defecto de
-- Postgres, no SELECT/INSERT/UPDATE/DELETE. Sin esto, cualquier proceso de
-- servidor que use la service_role key (como el cron nocturno de Plaid en
-- app/api/cron/sync-all-plaid, que no tiene sesión de usuario) truena con
-- "permission denied for table X" — confirmado en producción al probar el
-- primer sync automático.
--
-- Ya se corrió a mano en el SQL Editor de Supabase el 2026-08-19; este
-- archivo solo lo deja documentado en el historial de migraciones para que
-- cualquier ambiente nuevo (o restaurado desde backup) lo tenga también.
-- Es seguro correrlo las veces que sea.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
