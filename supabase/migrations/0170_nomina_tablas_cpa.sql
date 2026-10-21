-- 0170 — Nómina: alinear con la tabla de nómina del CPA (Héctor, oct 2026)
--
-- Confirmado por el CPA (por_confirmar = false): FICA 6.2% con tope $184,500;
-- Medicare 1.45% + adicional 0.9% sobre $200,000 (solo empleado); SINOT/Disability
-- 0.3% con tope $9,000 (empleado y patrono); 10% sobre servicios profesionales
-- sobre los primeros $500 (ya implementado en Pagos).
-- Retención de Hacienda (fórmula del CPA):
--   anual − exención personal $3,500 − deducción especial (si la elige, escala
--   por salario) − dependientes × $2,500 (custodia compartida = 0.5)
--   − allowances por deducciones × $500 (veterano = +3) → tramos → ÷ periodos
--   − retención adicional fija.

-- 1) Empleados: dependientes con medios (custodia compartida) + campos nuevos
ALTER TABLE payroll_employees
  ALTER COLUMN dependientes TYPE numeric(4,1) USING dependientes::numeric(4,1);
ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS allowances_deduccion int NOT NULL DEFAULT 0 CHECK (allowances_deduccion >= 0),
  ADD COLUMN IF NOT EXISTS veterano boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deduccion_especial boolean NOT NULL DEFAULT false;

-- 2) Parámetros confirmados / corregidos
UPDATE payroll_params SET valor = 3500, por_confirmar = false,
  descripcion = 'Exención personal (499 R-4.1), concesión completa', fuente = 'Tabla de nómina del CPA (Héctor)'
 WHERE jurisdiccion = 'pr' AND anio = 2026 AND clave = 'exencion_personal';

UPDATE payroll_params SET valor = 1750, por_confirmar = true,
  descripcion = 'Exención personal compartida. SUPUESTO: mitad de la completa; el CPA solo envió la tabla para filing status Single — CONFIRMAR',
  fuente = 'Supuesto (pendiente CPA)'
 WHERE jurisdiccion = 'pr' AND anio = 2026 AND clave = 'exencion_compartida';

UPDATE payroll_params SET valor = 2500, por_confirmar = false,
  descripcion = 'Deducción por dependiente (Sección B del 499 R-4.1; custodia compartida cuenta 0.5)', fuente = 'Tabla de nómina del CPA (Héctor)'
 WHERE jurisdiccion = 'pr' AND anio = 2026 AND clave = 'dependiente_regular';

UPDATE payroll_params SET por_confirmar = false, fuente = 'Tabla de nómina del CPA (Héctor)'
 WHERE jurisdiccion = 'pr' AND anio = 2026 AND clave IN ('sinot_emp_tasa', 'sinot_pat_tasa', 'sinot_tope');

-- Ya no se usan en el cálculo (la fórmula del CPA no las contempla)
UPDATE payroll_params SET por_confirmar = false,
  descripcion = descripcion || ' — NO SE USA: la fórmula del CPA no incluye este concepto', fuente = 'Tabla de nómina del CPA (Héctor)'
 WHERE jurisdiccion = 'pr' AND anio = 2026
   AND clave IN ('dependiente_univ', 'deduccion_fija_soltero', 'deduccion_fija_casado_conjunto', 'deduccion_fija_casado_separado');

INSERT INTO payroll_params (jurisdiccion, anio, clave, valor, descripcion, fuente, por_confirmar) VALUES
  ('pr', 2026, 'deduccion_allowance', 500, 'Valor de cada allowance por deducciones (Sección C del 499 R-4.1)', 'Tabla de nómina del CPA (Héctor)', false),
  ('pr', 2026, 'veterano_allowances', 3, 'Allowances por deducciones adicionales si el empleado es veterano', 'Tabla de nómina del CPA (Héctor)', false)
ON CONFLICT (jurisdiccion, anio, clave) DO UPDATE
  SET valor = EXCLUDED.valor, descripcion = EXCLUDED.descripcion, fuente = EXCLUDED.fuente, por_confirmar = EXCLUDED.por_confirmar;

-- 3) Manual de VICTOR (artículo 'nomina'): reflejar la fórmula y lo ya validado por el CPA
UPDATE manual_articulos SET contenido = replace(replace(replace(contenido,
  $a$(anualiza el salario, resta exención + dependientes + deducción fija del 499 R-4, aplica los tramos de Hacienda y lo divide entre los periodos del año, más la retención adicional)$a$,
  $a$(anualiza el salario, resta la exención personal de $3,500, la deducción especial si el empleado la elige, $2,500 por dependiente (custodia compartida cuenta 0.5) y $500 por cada allowance por deducciones del 499 R-4.1 (un veterano suma 3), aplica los tramos de Hacienda, lo divide entre los periodos del año y resta la retención adicional fija)$a$),
  $b$dependientes y dependientes universitarios$b$,
  $b$dependientes (la custodia compartida cuenta 0.5), allowances por deducciones, si es veterano y si elige la deducción especial$b$),
  $c$varias tasas y reglas (SINOT, choferil, exenciones y dependientes del 499 R-4, deducción fija por estado civil, multiplicador de horas extra, tasa SUTA por defecto y el crédito FUTA)$c$,
  $c$algunas tasas y reglas (choferil, exención personal compartida, multiplicador de horas extra, tasa SUTA por defecto y el crédito FUTA) — el Seguro Social, Medicare, SINOT y la fórmula de retención de Hacienda ya vienen de la tabla de nómina del contable (CPA) —$c$)
 WHERE slug = 'nomina';
