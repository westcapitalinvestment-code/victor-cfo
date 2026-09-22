-- ============================================================================
-- VICTOR CFO — 0093: recordatorio de onboarding incompleto
-- ============================================================================
-- Caso real detectado 22 sept 2026 por Joel: un cliente pagando (Core,
-- activo) nunca terminó la conversación de onboarding con VICTOR
-- (user_profiles.perfil_completo sigue en false), y como el saludo
-- proactivo diario (migración 0014) solo se dispara cuando perfil_completo
-- ya es true, VICTOR nunca lo buscó de vuelta — el chat de onboarding SÍ se
-- le vuelve a abrir solo en cada visita al dashboard, pero si la persona
-- simplemente no regresó a la app, no hay ningún empujón externo (push o
-- correo) que la traiga de vuelta a terminarlo.
--
-- recordatorio_onboarding_enviado evita mandarle el correo más de una vez
-- por usuario — a diferencia del saludo diario (que se repite cada día),
-- este es un solo empujón, no una cadena de correos.
-- ============================================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS recordatorio_onboarding_enviado boolean NOT NULL DEFAULT false;
