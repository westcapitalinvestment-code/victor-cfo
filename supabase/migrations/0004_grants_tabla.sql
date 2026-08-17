-- ============================================================================
-- VICTOR CFO — 0004: permisos base a nivel de tabla (GRANT).
-- ============================================================================
-- Por qué hace falta: RLS (0001/0003) controla QUÉ FILAS puede ver/tocar
-- cada usuario, pero es una capa aparte de si el rol "authenticated" tiene
-- permiso siquiera de tocar la TABLA. Sin el GRANT, Postgres devuelve
-- "permission denied for table X" ANTES de llegar a evaluar RLS — es
-- justo el error que salió al probar el dashboard por primera vez
-- (business_entities). Este archivo lo resuelve para todas las tablas
-- existentes y dice que las que se creen después también lo tengan
-- automáticamente (ALTER DEFAULT PRIVILEGES).
--
-- Es seguro correrlo las veces que sea — GRANT no falla si ya existe.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Para que las próximas migraciones (0005, 0006...) no repitan este problema
-- con tablas nuevas.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- Las funciones que la app va a llamar directo (no solo desde triggers)
-- necesitan EXECUTE explícito.
GRANT EXECUTE ON FUNCTION match_category(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION record_user_correction(uuid, uuid, text, integer, uuid, text) TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- NOTA: no se le da nada a "anon" a propósito — es una app financiera, todo
-- pasa por login. Si algún día hace falta una tabla pública sin login
-- (poco probable aquí), se añade explícitamente, no por default.
-- ============================================================================
