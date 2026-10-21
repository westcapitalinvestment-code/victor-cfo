-- Bono de Navidad configurable por entidad (21 oct 2026, pedido de Joel: "espacios
-- configurables como en las tasas, que el patrono ponga los números"). Todo NULL =
-- se usan las sugerencias del código (6 % hasta $600, 700 horas, período 1-oct a
-- 30-sep, pago el 15-dic), marcadas "por confirmar" con el contable. Si el patrono
-- escribe sus valores, se usan esos.
ALTER TABLE payroll_entity_config
  ADD COLUMN IF NOT EXISTS bono_activo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bono_pct numeric CHECK (bono_pct IS NULL OR (bono_pct >= 0 AND bono_pct <= 1)),
  ADD COLUMN IF NOT EXISTS bono_tope numeric CHECK (bono_tope IS NULL OR bono_tope >= 0),
  ADD COLUMN IF NOT EXISTS bono_horas_min numeric CHECK (bono_horas_min IS NULL OR bono_horas_min >= 0),
  ADD COLUMN IF NOT EXISTS bono_inicio text CHECK (bono_inicio IS NULL OR bono_inicio ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  ADD COLUMN IF NOT EXISTS bono_fin text CHECK (bono_fin IS NULL OR bono_fin ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  ADD COLUMN IF NOT EXISTS bono_fecha_pago text CHECK (bono_fecha_pago IS NULL OR bono_fecha_pago ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
