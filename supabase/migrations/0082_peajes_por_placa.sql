-- ============================================================================
-- VICTOR CFO — 0082: peajes por placa (10 sept 2026, pedido de Joel).
-- ============================================================================
-- Sigue del problema real de la migración 0081 (evidencia de gastos por
-- técnico): el peaje NO se puede reconciliar como gasolina porque el banco
-- (y por lo tanto Plaid) solo ve el cobro consolidado que AutoExpreso le
-- hace a la cuenta una vez al mes — nunca el cruce individual de un carro
-- específico. Pero AutoExpreso SÍ desglosa cada cruce por PLACA en su
-- propio estado de cuenta (PDF que Joel mandó de ejemplo: columna
-- "License / State" en cada fila). Esa es la fuente de verdad real, y no
-- depende de que nadie la autorreporte — por eso este es un módulo
-- independiente de expense_evidence_*, no una extensión de él.
--
-- Flujo: el dueño registra sus vehículos por placa, sube el PDF mensual de
-- AutoExpreso (se extrae con Claude, mismo patrón que estados de cuenta
-- bancarios — ver /api/cuentas/estado/pdf/extraer), y cada cruce queda
-- guardado con su placa. Si la placa está en el registro de vehículos, se
-- vincula sola; si no, queda "sin vehículo" para que el dueño la agregue.
-- ============================================================================

CREATE TABLE vehiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  placa text NOT NULL,
  alias text,                              -- ej. "Van 3", "Camión de Pedro"
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX vehiculos_entity_idx ON vehiculos (entity_id);
-- Normaliza mayúsculas/espacios al comparar placas, sin bloquear que dos
-- entidades distintas registren la misma placa (flotas separadas).
CREATE UNIQUE INDEX vehiculos_entity_placa_idx ON vehiculos (entity_id, upper(trim(placa)));

ALTER TABLE vehiculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY vehiculos_owner ON vehiculos FOR ALL USING (owner_id = auth.uid());
GRANT ALL ON vehiculos TO authenticated;

-- Cada PDF de AutoExpreso subido — igual que statement_uploads (0072) pero
-- separado porque esto no es una cuenta bancaria (plaid_account_id /
-- manual_account_id no aplican aquí).
CREATE TABLE peaje_statement_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  nombre_archivo text NOT NULL,
  r2_key text NOT NULL,
  periodo_desde date,
  periodo_hasta date,
  total_cruces integer NOT NULL DEFAULT 0,
  total_monto numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE peaje_statement_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY peaje_statement_uploads_owner ON peaje_statement_uploads FOR ALL USING (owner_id = auth.uid());
GRANT ALL ON peaje_statement_uploads TO authenticated;

CREATE TABLE peaje_cruces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  statement_upload_id uuid NOT NULL REFERENCES peaje_statement_uploads(id) ON DELETE CASCADE,
  vehiculo_id uuid REFERENCES vehiculos(id) ON DELETE SET NULL, -- null = placa no registrada todavía
  placa_raw text NOT NULL,                 -- lo que decía el PDF, aunque no haya match (así no se pierde el dato)
  fecha date NOT NULL,
  hora time,
  plaza text,
  monto numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX peaje_cruces_entity_idx ON peaje_cruces (entity_id);
CREATE INDEX peaje_cruces_vehiculo_idx ON peaje_cruces (vehiculo_id);
CREATE INDEX peaje_cruces_upload_idx ON peaje_cruces (statement_upload_id);

ALTER TABLE peaje_cruces ENABLE ROW LEVEL SECURITY;
CREATE POLICY peaje_cruces_owner ON peaje_cruces FOR ALL USING (owner_id = auth.uid());
GRANT ALL ON peaje_cruces TO authenticated;
