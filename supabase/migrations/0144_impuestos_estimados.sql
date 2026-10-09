-- Impuestos estimados en el Home (8 oct 2026, pedido de Joel: "una tabla con
-- los valores de hacienda (los brackets) ... que VICTOR calcule más o menos
-- cuánto debería apartar para los taxes, cuánto tendría en reintegro y/o las
-- estimadas del IRS ... debe aparecer en el home para que se vaya preparando
-- el camino antes de que llegue el evento de las planillas ... los
-- cuentapropistas tienen que pagar el 15.3% al IRS trimestral").
--
-- FUENTES (verificadas 8 oct 2026):
--   Federal 2026: IRS Rev. Proc. 2025-32 / IR-2025-103 (irs.gov). Tramos y
--     deducción estándar. SS wage base $184,500 (SSA). SE tax 15.3%.
--   Puerto Rico: tramos individuales del Código de Rentas Internas vigentes
--     para 2018 y años siguientes (PwC Worldwide Tax Summaries, revisado 7 ago
--     2026): 0% hasta $9,000 / 7% / 14% / 25% / 33% sobre $61,500. Factor de
--     ajuste 92% (ingreso bruto <= $100,000) o 95% (> $100,000). Corporación:
--     18.5% normal + sobretasa graduada sobre (ingreso neto - $25,000).
--   La "Reforma Contributiva" (P. de la C. 1014 / P. del S. 912) NO estaba
--     aprobada al 8 oct 2026 — por eso NO se usa. Cuando se apruebe: insertar
--     filas nuevas con otro `anio`, la app toma el año más reciente <= año
--     actual, no hay que tocar código.
--
-- LO QUE NO MODELA A PROPÓSITO (el estimado es conservador y lo dice en UI):
--   deducciones/exenciones personales de PR, deducción QBI federal, créditos,
--   Contribución Básica Alterna (CBA) / ABT, sobretasa de ajuste gradual,
--   impuesto estatal de EE.UU., Medicare adicional 0.9%.
--
-- ESTAS TABLAS SON DE LECTURA PARA TODO USUARIO AUTENTICADO — solo el service
-- role (o el SQL Editor de Joel) las puede modificar. Cada año nuevo = filas
-- nuevas con otro `anio`.

CREATE TABLE IF NOT EXISTS tax_brackets (
  id bigserial PRIMARY KEY,
  jurisdiccion text NOT NULL CHECK (jurisdiccion IN ('federal', 'pr')),
  anio int NOT NULL,
  -- federal: 'single' | 'mfj' ; pr: 'individuo' | 'corp_surtax'
  estatus text NOT NULL,
  -- Límite inferior del tramo (la tasa aplica al exceso sobre `desde`).
  -- El límite superior es el `desde` del siguiente tramo — no se guarda
  -- para que no pueda quedar inconsistente.
  desde numeric NOT NULL,
  tasa numeric NOT NULL CHECK (tasa >= 0 AND tasa <= 1),
  fuente text,
  UNIQUE (jurisdiccion, anio, estatus, desde)
);

CREATE TABLE IF NOT EXISTS tax_params (
  id bigserial PRIMARY KEY,
  jurisdiccion text NOT NULL CHECK (jurisdiccion IN ('federal', 'pr')),
  anio int NOT NULL,
  clave text NOT NULL,
  valor numeric NOT NULL,
  fuente text,
  UNIQUE (jurisdiccion, anio, clave)
);

ALTER TABLE tax_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_params ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_brackets_read ON tax_brackets;
CREATE POLICY tax_brackets_read ON tax_brackets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS tax_params_read ON tax_params;
CREATE POLICY tax_params_read ON tax_params FOR SELECT TO authenticated USING (true);

GRANT SELECT ON tax_brackets TO authenticated;
GRANT SELECT ON tax_params TO authenticated;
GRANT ALL ON tax_brackets TO service_role;
GRANT ALL ON tax_params TO service_role;
GRANT USAGE, SELECT ON SEQUENCE tax_brackets_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE tax_params_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- SEED 2026 — Federal (IRS Rev. Proc. 2025-32)
-- ---------------------------------------------------------------------------
INSERT INTO tax_brackets (jurisdiccion, anio, estatus, desde, tasa, fuente) VALUES
  ('federal', 2026, 'single',      0, 0.10, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'single',  12400, 0.12, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'single',  50400, 0.22, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'single', 105700, 0.24, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'single', 201775, 0.32, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'single', 256225, 0.35, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'single', 640600, 0.37, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'mfj',         0, 0.10, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'mfj',     24800, 0.12, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'mfj',    100800, 0.22, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'mfj',    211400, 0.24, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'mfj',    403550, 0.32, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'mfj',    512450, 0.35, 'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'mfj',    768700, 0.37, 'IRS Rev. Proc. 2025-32')
ON CONFLICT (jurisdiccion, anio, estatus, desde) DO NOTHING;

INSERT INTO tax_params (jurisdiccion, anio, clave, valor, fuente) VALUES
  ('federal', 2026, 'deduccion_estandar_single', 16100,  'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'deduccion_estandar_mfj',    32200,  'IRS Rev. Proc. 2025-32'),
  ('federal', 2026, 'ss_wage_base',              184500, 'SSA 2026'),
  ('federal', 2026, 'se_factor_neto',            0.9235, 'IRC 1402(a) — 92.35% de la ganancia neta'),
  ('federal', 2026, 'se_tasa_seguro_social',     0.124,  'IRC 1401(a)'),
  ('federal', 2026, 'se_tasa_medicare',          0.029,  'IRC 1401(b)'),
  ('federal', 2026, 'se_minimo',                 400,    'IRC 1402(b)(2) — ganancia SE neta mínima'),
  ('federal', 2026, 'tasa_corporacion',          0.21,   'IRC 11(b)')
ON CONFLICT (jurisdiccion, anio, clave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SEED 2026 — Puerto Rico (Código de Rentas Internas; PwC WWTS ago 2026)
-- ---------------------------------------------------------------------------
INSERT INTO tax_brackets (jurisdiccion, anio, estatus, desde, tasa, fuente) VALUES
  ('pr', 2026, 'individuo',   0, 0.00, 'PwC WWTS PR — revisado 7 ago 2026'),
  ('pr', 2026, 'individuo',  9000, 0.07, 'PwC WWTS PR — revisado 7 ago 2026'),
  ('pr', 2026, 'individuo', 25000, 0.14, 'PwC WWTS PR — revisado 7 ago 2026'),
  ('pr', 2026, 'individuo', 41500, 0.25, 'PwC WWTS PR — revisado 7 ago 2026'),
  ('pr', 2026, 'individuo', 61500, 0.33, 'PwC WWTS PR — revisado 7 ago 2026'),
  -- Sobretasa graduada de corporaciones: se aplica al "surtax net income"
  -- (ingreso neto - $25,000 de deducción especial).
  ('pr', 2026, 'corp_surtax',      0, 0.05, 'PwC WWTS PR — revisado 7 ago 2026'),
  ('pr', 2026, 'corp_surtax',  75000, 0.15, 'PwC WWTS PR — revisado 7 ago 2026'),
  ('pr', 2026, 'corp_surtax', 125000, 0.16, 'PwC WWTS PR — revisado 7 ago 2026'),
  ('pr', 2026, 'corp_surtax', 175000, 0.17, 'PwC WWTS PR — revisado 7 ago 2026'),
  ('pr', 2026, 'corp_surtax', 225000, 0.18, 'PwC WWTS PR — revisado 7 ago 2026'),
  ('pr', 2026, 'corp_surtax', 275000, 0.19, 'PwC WWTS PR — revisado 7 ago 2026')
ON CONFLICT (jurisdiccion, anio, estatus, desde) DO NOTHING;

INSERT INTO tax_params (jurisdiccion, anio, clave, valor, fuente) VALUES
  ('pr', 2026, 'tasa_normal_corporacion',   0.185,  'PwC WWTS PR — 18.5% normal'),
  ('pr', 2026, 'surtax_deduccion_especial', 25000,  'PwC WWTS PR'),
  ('pr', 2026, 'factor_ajuste_bajo',        0.92,   'PwC WWTS PR — ingreso bruto <= umbral'),
  ('pr', 2026, 'factor_ajuste_alto',        0.95,   'PwC WWTS PR — ingreso bruto > umbral'),
  ('pr', 2026, 'factor_ajuste_umbral',      100000, 'PwC WWTS PR')
ON CONFLICT (jurisdiccion, anio, clave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Perfil del estimado por usuario (y por entidad de negocio, opcional).
-- entity_id NULL = el estimado de Personal. Los valores `retenido_ytd` y
-- `estimadas_pagadas_ytd` los escribe el usuario a mano (de su talonario /
-- de sus recibos de pago al IRS y a Hacienda) — VICTOR no los puede inferir
-- de forma confiable desde los depósitos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_estimate_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  residencia text NOT NULL DEFAULT 'pr' CHECK (residencia IN ('pr', 'us')),
  estatus text NOT NULL DEFAULT 'single' CHECK (estatus IN ('single', 'mfj')),
  tipo text NOT NULL DEFAULT 'cuenta_propia' CHECK (tipo IN ('cuenta_propia', 'empleado', 'corporacion')),
  -- % de los ingresos que se estima como gasto deducible (para cuentas
  -- personales donde los gastos de negocio no están separados).
  gastos_deducibles_pct numeric NOT NULL DEFAULT 0 CHECK (gastos_deducibles_pct >= 0 AND gastos_deducibles_pct <= 100),
  retenido_ytd numeric NOT NULL DEFAULT 0 CHECK (retenido_ytd >= 0),
  estimadas_pagadas_ytd numeric NOT NULL DEFAULT 0 CHECK (estimadas_pagadas_ytd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_estimate_settings_owner_entity
  ON tax_estimate_settings (owner_id, COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE tax_estimate_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_estimate_settings_owner_all ON tax_estimate_settings;
CREATE POLICY tax_estimate_settings_owner_all ON tax_estimate_settings FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON tax_estimate_settings TO authenticated;
GRANT ALL ON tax_estimate_settings TO service_role;
