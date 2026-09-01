-- ============================================================================
-- VICTOR CFO — 0013: cuentas manuales + importar transacciones por CSV
-- ============================================================================
-- Motivación (caso real de Joel): la tarjeta Apple Card no tiene integración
-- con Plaid (Goldman Sachs, el banco detrás, no la expone) — no hay forma de
-- conectarla como BPPR/Citibank. Y aunque un banco SÍ esté en Plaid, algunos
-- (ej. BPPR) solo entregan ~45 días de historial por esa vía, aunque el
-- banco tenga meses o años más disponibles en su propio portal.
--
-- manual_accounts es el mismo concepto que plaid_accounts (una cuenta con
-- nombre/tipo/balance que cuenta en Home y en Cuentas) pero sin Item de
-- Plaid detrás — el balance se actualiza a mano, y las transacciones (si
-- las hay) se suben por CSV en vez de llegar solas por transactionsSync.
-- ============================================================================

CREATE TABLE manual_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,                     -- depository | credit | loan | investment (mismo vocabulario que plaid_accounts)
  subtype text,                           -- checking | savings | credit card...
  mask text,                              -- últimos 4 dígitos, opcional
  current_balance numeric NOT NULL DEFAULT 0,
  es_negocio boolean NOT NULL DEFAULT false,
  balance_actualizado_en timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE manual_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY manual_accounts_owner ON manual_accounts FOR ALL USING (owner_id = auth.uid());
GRANT ALL ON manual_accounts TO authenticated;

-- transactions ya sabe asociarse a una cuenta de Plaid (plaid_account_id,
-- texto suelto sin FK real). Le añadimos el equivalente para cuentas
-- manuales, con FK real esta vez, y un campo "origen" para saber de dónde
-- vino cada fila sin tener que adivinar por cuál columna está llena.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS manual_account_id uuid REFERENCES manual_accounts(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'plaid'; -- plaid | manual_csv | manual

-- Dedup de importaciones CSV — si el usuario sube el mismo estado de cuenta
-- dos veces (o un rango de fechas que se solapa con una subida anterior),
-- no queremos duplicar los gastos. Como un CSV no trae un id único como
-- Plaid, usamos (cuenta + fecha + descripción + monto) como huella — no es
-- perfecto (dos compras idénticas el mismo día en el mismo comercio se
-- tratarían como duplicado) pero cubre el caso real casi siempre, y el
-- usuario puede seguir editando/categorizando a mano si hace falta.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_manual_dedup_key
  ON transactions (manual_account_id, fecha, description_raw, amount)
  WHERE manual_account_id IS NOT NULL;
