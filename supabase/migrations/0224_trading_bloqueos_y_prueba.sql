-- VICTOR CFO — 0224: bloqueos por horario/sesión/día/fechas/noticias, periodo de prueba
-- del plan y cambios de reglas que aplican "desde mañana" (22 nov 2026, pedido de Joel).
--
-- Horas y fechas se guardan en la zona horaria de la persona (zona_horaria). Las
-- sesiones (Asia, Londres, Londres+NY, Nueva York) son del mercado y se convierten
-- solas. El guardián recibe las ventanas ya convertidas a UTC al sincronizar.

ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS zona_horaria text NOT NULL DEFAULT 'America/Puerto_Rico';
-- [{"ini":"08:00","fin":"14:00"}] en hora local. Vacío = sin límite de horas.
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS horario_ventanas jsonb NOT NULL DEFAULT '[]'::jsonb;
-- 'asia' | 'londres' | 'solape' | 'nueva_york'. Vacío = sin límite por sesión.
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS horario_sesiones text[] NOT NULL DEFAULT '{}';
-- 0 = domingo … 6 = sábado (hora local)
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS dias_bloqueados int[] NOT NULL DEFAULT '{}';
-- [{"desde":"2026-12-01","hasta":"2026-12-05","motivo":"NFP"}] fechas locales, ambas incluidas
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS pausas jsonb NOT NULL DEFAULT '[]'::jsonb;
-- minutos antes y después de noticias de alto impacto (0 = apagado)
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS noticias_min int NOT NULL DEFAULT 0;
ALTER TABLE risk_rules DROP CONSTRAINT IF EXISTS risk_rules_noticias_min_check;
ALTER TABLE risk_rules ADD CONSTRAINT risk_rules_noticias_min_check CHECK (noticias_min BETWEEN 0 AND 120);

-- Periodo de prueba del plan (mínimo 14 días)
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS prueba_inicio date;
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS prueba_dias int;
ALTER TABLE risk_rules DROP CONSTRAINT IF EXISTS risk_rules_prueba_dias_check;
ALTER TABLE risk_rules ADD CONSTRAINT risk_rules_prueba_dias_check CHECK (prueba_dias IS NULL OR prueba_dias BETWEEN 14 AND 90);
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS prueba_avisada boolean NOT NULL DEFAULT false;   -- correo de fin enviado
ALTER TABLE risk_rules ADD COLUMN IF NOT EXISTS prueba_revisada boolean NOT NULL DEFAULT false;  -- ya la revisó con VICTOR

-- Historial de cambios de reglas. estado 'pendiente' = afloja una regla y aplica
-- desde aplicar_desde (medianoche de mañana en la hora de la persona).
CREATE TABLE IF NOT EXISTS trading_reglas_cambios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cambios jsonb NOT NULL,                 -- {"campo": {"antes": x, "despues": y}}
  estado text NOT NULL CHECK (estado IN ('aplicado','pendiente','cancelado')),
  aplicar_desde timestamptz,
  aplicado_at timestamptz,
  origen text NOT NULL DEFAULT 'web' CHECK (origen IN ('web','chat','plan')),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_reglas_cambios_owner_idx ON trading_reglas_cambios (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trading_reglas_cambios_pend_idx ON trading_reglas_cambios (owner_id) WHERE estado = 'pendiente';

ALTER TABLE trading_reglas_cambios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trading_reglas_cambios_owner ON trading_reglas_cambios;
CREATE POLICY trading_reglas_cambios_owner ON trading_reglas_cambios FOR ALL
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
GRANT ALL ON trading_reglas_cambios TO authenticated;
GRANT ALL ON trading_reglas_cambios TO service_role;

NOTIFY pgrst, 'reload schema';
