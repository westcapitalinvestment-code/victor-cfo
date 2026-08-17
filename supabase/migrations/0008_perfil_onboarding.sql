-- ============================================================================
-- VICTOR CFO — 0008: campos de perfil profundo (Capa 2 del prompt de VICTOR)
-- ============================================================================
-- El formulario de onboarding (app/onboarding) solo captura nombre + teléfono
-- — lo mínimo para poder usar el dashboard. Esta migración añade las
-- columnas para las preguntas que VICTOR hace por CHAT una vez el usuario
-- ya está en su Inicio (apodo, género, edad, situación, hijos), tal como
-- describe la Capa 2 del system prompt. perfil_completo indica si VICTOR
-- ya terminó esa conversación al menos una vez.
-- ============================================================================

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS apodo text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS genero text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS edad integer;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS situacion text; -- soltero/a, casado/a, con pareja, etc.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tiene_hijos boolean;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS hijos_detalle text; -- cantidad/edades, texto libre
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS perfil_completo boolean NOT NULL DEFAULT false;
