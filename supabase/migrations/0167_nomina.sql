-- ============================================================================
-- VICTOR CFO — 0167: Módulo Nómina (19 oct 2026, pedido de Joel)
--
-- Addon aparte "Nómina" ($24.99/mes), al lado de Pagos. Mismo patrón plano que
-- Pagos/Técnicos (migración 0134): un subscription item en la suscripción del
-- usuario, columnas addon_nomina_status / addon_nomina_item_id en users.
--
-- ALCANCE: VICTOR CALCULA (retenciones del empleado, contribuciones del
-- patrono, recibo, montos a depositar y asiento contable). NO radica ni
-- deposita nada por el cliente.
--
-- TASAS Y TOPES: viven en payroll_params (por año), no en el código. Cada fila
-- trae `por_confirmar` = true hasta que el contable la valide. Para cambiar un
-- número: UPDATE payroll_params SET valor = ..., por_confirmar = false WHERE
-- jurisdiccion = 'pr' AND anio = 2026 AND clave = '...'; — no hace falta
-- desplegar código. Para un año nuevo: insertar filas con otro `anio` (la app
-- toma el año más reciente <= año de la corrida).
--
-- Los tramos de retención de Hacienda se leen de tax_brackets (pr/individuo),
-- los mismos de impuestos estimados (migración 0144).
--
-- El SSN NO se guarda completo: solo los últimos 4 dígitos.
-- ============================================================================

-- 1) Addon en users ----------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_nomina_status text DEFAULT 'inactivo'; -- inactivo | activo
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_nomina_item_id text;

-- 2) Parámetros de tasas/topes por año -----------------------------------------
CREATE TABLE IF NOT EXISTS payroll_params (
  id bigserial PRIMARY KEY,
  jurisdiccion text NOT NULL CHECK (jurisdiccion IN ('federal', 'pr')),
  anio int NOT NULL,
  clave text NOT NULL,
  valor numeric NOT NULL,
  descripcion text,
  fuente text,
  por_confirmar boolean NOT NULL DEFAULT true,
  UNIQUE (jurisdiccion, anio, clave)
);

ALTER TABLE payroll_params ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_params_read ON payroll_params;
CREATE POLICY payroll_params_read ON payroll_params FOR SELECT TO authenticated USING (true);
GRANT SELECT ON payroll_params TO authenticated;
GRANT ALL ON payroll_params TO service_role;
GRANT USAGE, SELECT ON SEQUENCE payroll_params_id_seq TO service_role;

INSERT INTO payroll_params (jurisdiccion, anio, clave, valor, descripcion, fuente, por_confirmar) VALUES
  -- Federal (IRS / SSA) ---------------------------------------------------
  ('federal', 2026, 'ss_tasa',               0.062,   'Seguro Social (OASDI) — empleado y patrono', 'SSA/IRS', false),
  ('federal', 2026, 'ss_tope',               184500,  'Tope salarial anual de Seguro Social 2026', 'SSA 2026 (contribution and benefit base)', false),
  ('federal', 2026, 'medicare_tasa',         0.0145,  'Medicare — empleado y patrono, sin tope', 'IRS', false),
  ('federal', 2026, 'medicare_adic_tasa',    0.009,   'Medicare adicional — SOLO empleado', 'IRC 3101(b)(2)', false),
  ('federal', 2026, 'medicare_adic_umbral',  200000,  'Salario anual sobre el cual aplica el Medicare adicional', 'IRC 3101(b)(2)', false),
  ('federal', 2026, 'futa_tasa_bruta',       0.06,    'FUTA tasa bruta', 'IRS Form 940-PR', false),
  ('federal', 2026, 'futa_credito',          0.054,   'Crédito FUTA por desempleo estatal (máx.) — sujeto a que PR no tenga reducción de crédito', 'IRS Form 940-PR', true),
  ('federal', 2026, 'futa_tope',             7000,    'Base salarial FUTA por empleado', 'IRS Form 940-PR', false),
  -- Puerto Rico -----------------------------------------------------------
  ('pr', 2026, 'sinot_emp_tasa',        0.003,  'SINOT empleado (DTRH). Valor tomado de una guía externa — CONFIRMAR con el contable', 'Guía externa (Gemini) — sin verificar', true),
  ('pr', 2026, 'sinot_pat_tasa',        0.003,  'SINOT patrono (DTRH). CONFIRMAR con el contable', 'Guía externa (Gemini) — sin verificar', true),
  ('pr', 2026, 'sinot_tope',            9000,   'Base salarial anual SINOT', 'Guía externa (Gemini) — sin verificar', true),
  ('pr', 2026, 'suta_tope',             7000,   'Base salarial anual SUTA (desempleo estatal)', 'DTRH', true),
  ('pr', 2026, 'suta_tasa_default',     0.0165, 'Tasa SUTA por defecto si la entidad no configura la suya (la real la asigna el DTRH según experiencia)', 'Guía externa (Gemini) — sin verificar', true),
  ('pr', 2026, 'choferil_semanal',      0.50,   'Seguro de Choferes: tarifa fija semanal por empleado cubierto. CONFIRMAR', 'Guía externa (Gemini) — sin verificar', true),
  ('pr', 2026, 'ot_multiplo',           1.5,    'Multiplicador de horas extra. En PR puede ser distinto (tiempo doble) según fecha de contratación y tamaño del patrono — CONFIRMAR', 'Guía externa (Gemini) — sin verificar', true),
  ('pr', 2026, 'exencion_personal',     5000,   'Exención personal (499 R-4), concesión completa. CONFIRMAR vigencia', 'Guía externa (Gemini) — sin verificar', true),
  ('pr', 2026, 'exencion_compartida',   2500,   'Exención personal compartida (499 R-4). CONFIRMAR vigencia', 'Guía externa (Gemini) — sin verificar', true),
  ('pr', 2026, 'dependiente_regular',   2500,   'Deducción por dependiente regular', 'Guía externa (Gemini) — sin verificar', true),
  ('pr', 2026, 'dependiente_univ',      1250,   'Deducción por dependiente universitario', 'Guía externa (Gemini) — sin verificar', true),
  ('pr', 2026, 'deduccion_fija_soltero', 0,     'Deducción fija por estado civil — Soltero. CONFIRMAR', 'Pendiente', true),
  ('pr', 2026, 'deduccion_fija_casado_conjunto', 0, 'Deducción fija — Casado rinde conjunto. CONFIRMAR', 'Pendiente', true),
  ('pr', 2026, 'deduccion_fija_casado_separado', 0, 'Deducción fija — Casado rinde por separado. CONFIRMAR', 'Pendiente', true)
ON CONFLICT (jurisdiccion, anio, clave) DO NOTHING;

-- 3) Configuración de nómina por entidad -----------------------------------
CREATE TABLE IF NOT EXISTS payroll_entity_config (
  entity_id uuid PRIMARY KEY REFERENCES business_entities(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suta_tasa numeric CHECK (suta_tasa IS NULL OR (suta_tasa >= 0 AND suta_tasa <= 0.2)),
  cfse_tasa numeric CHECK (cfse_tasa IS NULL OR (cfse_tasa >= 0 AND cfse_tasa <= 0.5)),
  cfse_poliza text,
  cfse_codigo_riesgo text,
  futa_aplica boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Empleados ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  ssn_ultimos4 text CHECK (ssn_ultimos4 IS NULL OR ssn_ultimos4 ~ '^[0-9]{4}$'),
  email text,
  frecuencia text NOT NULL DEFAULT 'quincenal' CHECK (frecuencia IN ('semanal', 'bisemanal', 'quincenal', 'mensual')),
  tipo_pago text NOT NULL DEFAULT 'salario' CHECK (tipo_pago IN ('salario', 'hora')),
  tarifa numeric NOT NULL DEFAULT 0 CHECK (tarifa >= 0), -- salario: por periodo; hora: por hora
  -- Formulario 499 R-4
  estado_civil text NOT NULL DEFAULT 'soltero' CHECK (estado_civil IN ('soltero', 'casado_conjunto', 'casado_separado')),
  exencion_personal text NOT NULL DEFAULT 'completa' CHECK (exencion_personal IN ('completa', 'compartida', 'ninguna')),
  dependientes int NOT NULL DEFAULT 0 CHECK (dependientes >= 0),
  dependientes_univ int NOT NULL DEFAULT 0 CHECK (dependientes_univ >= 0),
  retencion_adicional numeric NOT NULL DEFAULT 0 CHECK (retencion_adicional >= 0),
  -- Deducciones voluntarias por periodo
  deduccion_medico numeric NOT NULL DEFAULT 0 CHECK (deduccion_medico >= 0),
  aporte_401k numeric NOT NULL DEFAULT 0 CHECK (aporte_401k >= 0), -- monto por periodo, Sec. 1081.01 PR
  es_chofer boolean NOT NULL DEFAULT false,
  -- Acumulados del año ANTES de empezar a usar VICTOR (empleado que ya venía
  -- cobrando en el año). jsonb con claves: bruto, ss_emp, medicare_emp,
  -- sinot_emp, suta_base, futa_base, hacienda
  ytd_inicial jsonb NOT NULL DEFAULT '{}'::jsonb,
  ytd_inicial_anio int,
  fecha_ingreso date,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_employees_entity_idx ON payroll_employees (entity_id, activo);

-- 5) Corridas y líneas -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  anio int NOT NULL,
  frecuencia text NOT NULL CHECK (frecuencia IN ('semanal', 'bisemanal', 'quincenal', 'mensual')),
  periodo_inicio date NOT NULL,
  periodo_fin date NOT NULL,
  fecha_pago date NOT NULL,
  estado text NOT NULL DEFAULT 'aprobada' CHECK (estado IN ('borrador', 'aprobada')),
  totales jsonb NOT NULL DEFAULT '{}'::jsonb,
  depositos jsonb NOT NULL DEFAULT '{}'::jsonb,
  asiento jsonb NOT NULL DEFAULT '[]'::jsonb,
  advertencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  parametros_usados jsonb NOT NULL DEFAULT '{}'::jsonb, -- foto de las tasas usadas, para poder auditar la corrida luego
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_runs_entity_idx ON payroll_runs (entity_id, fecha_pago DESC);

CREATE TABLE IF NOT EXISTS payroll_run_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES payroll_employees(id) ON DELETE RESTRICT,
  anio int NOT NULL,
  entrada jsonb NOT NULL DEFAULT '{}'::jsonb, -- horas, horas extra, comisiones, etc.
  bruto numeric NOT NULL,
  neto numeric NOT NULL,
  -- Empleado
  ss_emp numeric NOT NULL DEFAULT 0,
  medicare_emp numeric NOT NULL DEFAULT 0,
  medicare_adic numeric NOT NULL DEFAULT 0,
  hacienda numeric NOT NULL DEFAULT 0,
  sinot_emp numeric NOT NULL DEFAULT 0,
  choferil numeric NOT NULL DEFAULT 0,
  otras_deducciones numeric NOT NULL DEFAULT 0,
  -- Patrono
  ss_pat numeric NOT NULL DEFAULT 0,
  medicare_pat numeric NOT NULL DEFAULT 0,
  futa numeric NOT NULL DEFAULT 0,
  suta numeric NOT NULL DEFAULT 0,
  sinot_pat numeric NOT NULL DEFAULT 0,
  cfse numeric NOT NULL DEFAULT 0,
  -- Bases ya consumidas por esta línea (para topes YTD de corridas futuras)
  base_suta numeric NOT NULL DEFAULT 0,
  base_futa numeric NOT NULL DEFAULT 0,
  base_sinot numeric NOT NULL DEFAULT 0,
  base_ss numeric NOT NULL DEFAULT 0,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb, -- recibo completo
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payroll_run_lines_emp_idx ON payroll_run_lines (employee_id, anio);
CREATE INDEX IF NOT EXISTS payroll_run_lines_run_idx ON payroll_run_lines (run_id);

-- 6) RLS: solo el dueño ----------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_entity_config', 'payroll_employees', 'payroll_runs', 'payroll_run_lines']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())', t || '_owner', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
    EXECUTE format('GRANT ALL ON %I TO service_role', t);
  END LOOP;
END $$;
