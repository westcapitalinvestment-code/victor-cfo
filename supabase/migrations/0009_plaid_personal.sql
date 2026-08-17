-- ============================================================================
-- VICTOR CFO — 0009: conexión bancaria real (Plaid) a nivel personal
-- ============================================================================
-- El diseño original (0001_schema_completo.sql) guardaba plaid_access_token
-- y plaid_item_id directamente en business_entities — eso significa que una
-- cuenta Core/personal (sin ningún business_entities todavía) no tenía
-- dónde guardar su conexión bancaria, y además solo permitía UN banco por
-- entidad. Esta migración lo reemplaza por dos tablas normalizadas:
--
--   plaid_items    — una fila por cada conexión (Item) de Plaid. entity_id
--                     null = cuenta personal del owner, igual que goals y
--                     documents. Un owner puede tener varios Items (varios
--                     bancos).
--   plaid_accounts — una fila por cada cuenta dentro de un Item (checking,
--                     savings, tarjeta...), con su balance más reciente.
--
-- Las columnas plaid_access_token/plaid_item_id que quedaron en
-- business_entities NO se tocan en esta migración (para no romper nada que
-- ya las use) — simplemente dejan de ser el camino recomendado; toda
-- conexión nueva (personal o de negocio) pasa por plaid_items de aquí en
-- adelante.
--
-- SEGURIDAD: access_token es la llave que le da a cualquiera acceso de
-- lectura a las cuentas bancarias reales del usuario en Plaid. NUNCA se
-- debe leer desde el navegador — todo el código de la app que la toca
-- (app/api/plaid/*) usa el cliente de Supabase del servidor, y el
-- frontend nunca hace un select() directo a esta tabla.
--
-- Además, lo que se guarda en esta columna YA VIENE CIFRADO a nivel de
-- aplicación (lib/crypto.ts, AES-256-GCM) antes de llegar aquí — nunca es
-- el access_token real en texto plano. La llave de cifrado vive en
-- PLAID_TOKEN_ENCRYPTION_KEY (variable de entorno del servidor, nunca en
-- la base de datos), así que aunque alguien lea esta tabla directamente
-- en Supabase, lo que ve es inútil sin esa llave.
-- ============================================================================

CREATE TABLE plaid_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE, -- null = personal
  plaid_item_id text NOT NULL UNIQUE,
  access_token text NOT NULL,          -- cifrado a nivel de aplicación (pendiente antes de producción)
  institution_id text,
  institution_name text,
  status text NOT NULL DEFAULT 'active', -- active | error | reauth_required
  cursor text,                          -- para /transactions/sync incremental de Plaid
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE plaid_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plaid_item_id uuid NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- denormalizado para que RLS sea simple
  plaid_account_id text NOT NULL UNIQUE,
  name text,
  official_name text,
  mask text,                            -- últimos 4 dígitos
  type text,                            -- depository | credit | loan | investment
  subtype text,                         -- checking | savings | credit card...
  current_balance numeric,
  available_balance numeric,
  iso_currency_code text DEFAULT 'USD',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY plaid_items_owner ON plaid_items FOR ALL USING (owner_id = auth.uid());

ALTER TABLE plaid_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY plaid_accounts_owner ON plaid_accounts FOR ALL USING (owner_id = auth.uid());

GRANT ALL ON plaid_items TO authenticated;
GRANT ALL ON plaid_accounts TO authenticated;

-- transactions.plaid_transaction_id ya existía (0001) pero sin índice
-- único — lo necesitamos para poder hacer upsert seguro cuando
-- /transactions/sync de Plaid nos manda la misma transacción dos veces
-- (pasa normal si el cron de sync corre más de una vez sobre el mismo
-- rango, o si Plaid reenvía por reintento).
CREATE UNIQUE INDEX IF NOT EXISTS transactions_plaid_transaction_id_key
  ON transactions (plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;
