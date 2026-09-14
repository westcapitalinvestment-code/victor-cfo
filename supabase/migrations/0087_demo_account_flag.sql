-- ============================================================================
-- VICTOR CFO — 0087: flag de cuenta demo + reset de perfil con un click
-- ============================================================================
-- Joel usa una cuenta demo separada (no su data real) para presentaciones
-- en vivo — entre cada persona/reunión, quiere poder resetear SOLO el
-- perfil (nombre, apodo, edad, hijos) y el chat de VICTOR, sin tocar la
-- data de negocio ya sembrada (AireFrío PR). is_demo marca esa ÚNICA
-- cuenta para que el botón "Reiniciar demo" en Configuración solo aparezca
-- (y solo funcione, el API route también lo valida) ahí — cualquier otra
-- cuenta real nunca ve ni puede disparar este reset.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Marca tu cuenta demo (corre esto UNA vez, cambiando el email):
-- UPDATE public.users SET is_demo = true WHERE email = 'tu-email-demo@aqui.com';
