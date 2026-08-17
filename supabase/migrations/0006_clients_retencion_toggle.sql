-- ============================================================================
-- VICTOR CFO — 0006: toggle "es_negocio" en clients (Feature 1 del brief
-- técnico: Retención B2B 10%/6% con Toggle y Pote Visual, Prioridad ALTA).
-- ============================================================================
-- clients.retention_pct ya existía (0001), pero faltaba el toggle explícito
-- que pide el brief: "¿Es un negocio? (Aplica Retención 10%)". Sin este
-- campo, no hay forma de distinguir "cliente individual, no aplica
-- retención" de "cliente negocio con 0% porque tiene Certificado de Relevo
-- total" — ambos casos hoy se ven igual (retention_pct = 0).
-- ============================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS es_negocio boolean DEFAULT false;

-- Cuando es_negocio = true, el default razonable es 10% (retención
-- estándar) — el usuario lo baja a 6% o 0% si el cliente tiene Certificado
-- de Relevo. Esto solo cambia el DEFAULT de la columna para inserts nuevos;
-- no toca filas existentes.
ALTER TABLE clients
  ALTER COLUMN retention_pct SET DEFAULT 10.00;
