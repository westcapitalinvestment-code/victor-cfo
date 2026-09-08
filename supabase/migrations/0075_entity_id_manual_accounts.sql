-- ============================================================================
-- VICTOR CFO — 0075: entity_id real en manual_accounts
-- ============================================================================
-- 8 sept 2026 — Joel: "creo que debe haber un botón para sincronizar y
-- añadir banco o cuentas manuales en cada entidad para que quede todo
-- separado en su tab". manual_accounts solo tenía es_negocio (boolean) —
-- para saber A CUÁL entidad pertenece una cuenta manual de negocio, la app
-- "adivinaba": solo funcionaba si el owner tenía EXACTAMENTE una entidad de
-- negocio activa (ver lib/owner-efectivo.ts y varias tools de VICTOR). Con
-- Joel teniendo 2+ entidades ese truco ya no alcanza.
--
-- Se añade entity_id real, mismo patrón que ya existe en plaid_accounts.
-- es_negocio se mantiene (no se borra nada) para no romper el código
-- existente que todavía lo lee — pasa a significar "es una cuenta de
-- negocio de ALGUNA entidad", y entity_id es la fuente de verdad de CUÁL.
-- Una cuenta manual vieja con es_negocio=true y entity_id NULL sigue
-- funcionando con el fallback de "única entidad activa" hasta que el
-- usuario la reasigne a mano (o hasta que solo tenga una entidad).
-- ============================================================================

ALTER TABLE manual_accounts ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES business_entities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS manual_accounts_entity_idx ON manual_accounts (entity_id) WHERE entity_id IS NOT NULL;
