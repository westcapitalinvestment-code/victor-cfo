-- ============================================================================
-- VICTOR CFO — 0081: evidencia de gastos por técnico + reconciliación con
-- transacciones bancarias (10 sept 2026, pedido de Joel).
-- ============================================================================
-- Caso real: en un negocio de transportación, un empleado puede echar
-- gasolina de su carro personal y pasarla como gasto de la tarjeta
-- corporativa (mal uso vicioso o hurto). La idea de Joel: que cada técnico
-- reporte evidencia (foto de la factura + monto + fecha) cada vez que
-- incurre en un gasto de ese tipo, y que eso se reconcilie automáticamente
-- contra las transacciones que llegan del banco — si una transacción de esa
-- categoría NO tiene evidencia correspondiente, es la bandera roja.
--
-- A PROPÓSITO no está hardcodeado a "gasolina" — Joel: "para el puede ser
-- gasolina pero para otros puede ser otra cosa". Cada dueño configura sus
-- propios tipos de gasto con evidencia requerida (expense_evidence_types) y
-- opcionalmente los vincula a una categoría de Hacienda existente
-- (hacienda_category_id) para que la reconciliación sepa qué transacciones
-- comparar. Sin vínculo a categoría, el tipo sirve solo para llevar el log
-- (sin reconciliación automática) hasta que el dueño lo vincule.
-- ============================================================================

CREATE TABLE expense_evidence_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  nombre text NOT NULL,                    -- ej. "Gasolina", "Peajes", "Materiales"
  hacienda_category_id integer REFERENCES hacienda_categories(id) ON DELETE SET NULL,
  tolerancia_monto numeric NOT NULL DEFAULT 5.00,  -- +/- $ al comparar evidencia vs transacción
  ventana_dias integer NOT NULL DEFAULT 3,          -- +/- días al comparar fechas (el banco tarda en postear)
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX expense_evidence_types_entity_idx ON expense_evidence_types (entity_id);

ALTER TABLE expense_evidence_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY expense_evidence_types_owner ON expense_evidence_types FOR ALL USING (owner_id = auth.uid());
GRANT ALL ON expense_evidence_types TO authenticated;

CREATE TABLE expense_evidence_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
  tipo_id uuid NOT NULL REFERENCES expense_evidence_types(id) ON DELETE CASCADE,
  monto numeric NOT NULL,
  fecha date NOT NULL,
  r2_key text NOT NULL,                    -- foto de la factura/recibo
  nota text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'reconciliado')),
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX expense_evidence_logs_entity_idx ON expense_evidence_logs (entity_id);
CREATE INDEX expense_evidence_logs_technician_idx ON expense_evidence_logs (technician_id);
-- Evita que 2 logs de evidencia se casen con la MISMA transacción bancaria.
CREATE UNIQUE INDEX expense_evidence_logs_transaction_unique ON expense_evidence_logs (transaction_id) WHERE transaction_id IS NOT NULL;

ALTER TABLE expense_evidence_logs ENABLE ROW LEVEL SECURITY;
-- El técnico escribe vía admin client (service_role, bypassea RLS — mismo
-- patrón que invoice_attachments desde /api/tecnico/*), así que esta policy
-- solo gobierna lo que ve/edita el DUEÑO desde el dashboard normal.
CREATE POLICY expense_evidence_logs_owner ON expense_evidence_logs FOR ALL USING (owner_id = auth.uid());
GRANT ALL ON expense_evidence_logs TO authenticated;
