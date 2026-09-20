-- ============================================================================
-- VICTOR CFO — 0090: tabla patrones_recurrentes
-- ============================================================================
-- Nace de un caso real (20 sept 2026): Joel le explicó a VICTOR, a mano, el
-- ciclo mensual completo de VIP Medical (Dr. Serrano $1,410, Dr. Gerena $800,
-- Dr. Diaz $517 a principio de cada mes; nómina el 30 y otra vez el 14) y le
-- dijo claro: "tu trabajo es mirarla, trackearla y recomendar... tienes que
-- aprender patrones y ejecutar para decir recomendaciones basadas en
-- patrones" — y que esto debe aplicar para CUALQUIER usuario, no solo VIP
-- Medical, incluyendo cuando lleguen clientes con equipo/técnicos.
--
-- Sin esta tabla, VICTOR no tenía dónde "recordar" un patrón entre
-- conversaciones — cada vez que Joel preguntaba por el draw/margen disponible,
-- tocaba redescubrir o volver a preguntar todo desde cero. Esta tabla guarda
-- ingresos/gastos recurrentes (por contraparte, monto esperado, frecuencia y
-- día del mes) para que proyeccion_margen_negocio (y futuras herramientas)
-- los usen directamente en vez de partir de cero cada turno.
--
-- Dos formas de llenarse: (1) el usuario se lo dice directamente a VICTOR en
-- conversación (fuente='usuario_dijo', estado='confirmado' de una vez — no
-- hace falta reconfirmar algo que la persona ya afirmó), o (2) VICTOR lo
-- detecta solo revisando transacciones repetidas en el historial
-- (fuente='detectado_automatico', estado='sugerido' hasta que el usuario lo
-- confirme — mismo principio de "confianza progresiva" que ya se usa para
-- aprender categorías, migración 0011/0017).
-- ============================================================================

CREATE TABLE patrones_recurrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE, -- NULL = patrón personal
  tipo text NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  contraparte text NOT NULL,        -- "Dr. Serrano", "Nómina Gretchen + Derek", "T-Mobile"
  descripcion text,                 -- detalle libre opcional
  monto_esperado numeric,           -- monto típico (o el más reciente si varía)
  monto_min numeric,                -- rango, si varía de mes a mes (ej. nómina)
  monto_max numeric,
  frecuencia text NOT NULL CHECK (frecuencia IN ('mensual', 'quincenal', 'semanal', 'personalizado')),
  dia_mes_esperado int,             -- 1-31, para 'mensual' (día típico en que ocurre)
  dias_mes_adicional int,           -- segundo día del mes, para 'quincenal' (ej. nómina el 30 Y el 14)
  notas text,
  estado text NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('confirmado', 'sugerido', 'descartado')),
  fuente text NOT NULL DEFAULT 'usuario_dijo' CHECK (fuente IN ('usuario_dijo', 'detectado_automatico')),
  ultima_vez_visto date,            -- última vez que una transacción real coincidió con este patrón
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX patrones_recurrentes_owner_idx ON patrones_recurrentes (owner_id);
CREATE INDEX patrones_recurrentes_entity_idx ON patrones_recurrentes (entity_id);

ALTER TABLE patrones_recurrentes ENABLE ROW LEVEL SECURITY;

-- Mismo patrón simple que citas (0030) — sin cruce con account_members,
-- porque el owner del patrón es quien lo puede ver/editar directamente.
CREATE POLICY patrones_recurrentes_access ON patrones_recurrentes FOR ALL USING (owner_id = auth.uid());

GRANT ALL ON patrones_recurrentes TO authenticated;
