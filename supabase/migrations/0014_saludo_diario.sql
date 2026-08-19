-- ============================================================================
-- VICTOR CFO — 0014: saludo proactivo diario.
-- ============================================================================
-- Guarda la última fecha (hora de Puerto Rico) en que VICTOR ya saludó
-- proactivamente al usuario al abrir el dashboard — evita que el saludo
-- automático se dispare más de una vez el mismo día si el usuario entra y
-- sale varias veces. Se actualiza desde app/api/victor/route.ts cuando
-- procesa el mensaje técnico oculto [SALUDO_DIARIO].
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS ultimo_saludo_en date;
