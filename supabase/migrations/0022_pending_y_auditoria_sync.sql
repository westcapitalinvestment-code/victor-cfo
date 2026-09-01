-- ============================================================================
-- VICTOR CFO — 0022: rastrear pendiente/posteada + auditoría de cambios que
-- vienen de Plaid como "modified" sobre una transacción ya guardada.
-- ============================================================================
-- CONTEXTO (bug real, 22 agosto 2026): Plaid a veces manda un cargo primero
-- como "pending" con una descripción/monto genéricos (ej. "AUTOMATIC
-- PAYMENT - THANK YOU" $179, un estimado mientras se procesa), y cuando se
-- liquida lo vuelve a mandar con el MISMO transaction_id pero ya con el
-- nombre/monto reales (ej. "MOHELA" $26.07) — dentro del arreglo "modified"
-- de transactionsSync, no como una transacción nueva. lib/plaid-sync.ts
-- hacía upsert de eso directo sobre la misma fila (por plaid_transaction_id)
-- sin guardar nunca que existió una versión anterior. Resultado: la
-- transacción "cambiaba de identidad" en silencio — VICTOR había
-- categorizado la versión vieja esa misma mañana, el usuario la vio en
-- Inicio, y poco después ya no quedaba ningún rastro de ella. Para un CPA
-- auditando los números, eso es exactamente el tipo de hueco que rompe la
-- confianza en los datos — Joel lo señaló como algo que había que cerrar
-- de raíz, no dejar pendiente.
--
-- Este archivo agrega:
--   1. transactions.pending — para saber si el monto/descripción actual
--      todavía puede cambiar (Plaid puede volver a mandarla en "modified").
--   2. transaction_sync_log — historial de cada vez que un "modified" de
--      Plaid cambió algo visible (descripción, monto, fecha, o pending) de
--      una transacción ya guardada. Solo lectura desde la app — lo escribe
--      el código de sincronización (lib/plaid-sync.ts).
-- ============================================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN transactions.pending IS
  'true mientras el banco todavía no liquida el cargo — Plaid puede corregir descripción/monto/fecha más adelante sin avisar de otra forma que un evento "modified". false = ya liquidado, no debería cambiar más. Ver transaction_sync_log para el historial de esos cambios.';

CREATE TABLE transaction_sync_log (
  id bigserial PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  plaid_transaction_id text,
  descripcion_anterior text,
  descripcion_nueva text,
  monto_anterior numeric,
  monto_nuevo numeric,
  fecha_anterior date,
  fecha_nueva date,
  pending_anterior boolean,
  pending_nuevo boolean,
  creado_en timestamptz DEFAULT now()
);

COMMENT ON TABLE transaction_sync_log IS
  'Auditoría de cada vez que Plaid mandó una transacción ya guardada como "modified" y algo visible cambió (típicamente: pasó de pendiente/estimada a liquidada/real). Existe para que un cambio de este tipo quede documentado en vez de simplemente sobrescribir la fila en silencio.';

CREATE INDEX idx_transaction_sync_log_owner ON transaction_sync_log (owner_id, creado_en DESC);

ALTER TABLE transaction_sync_log ENABLE ROW LEVEL SECURITY;

-- El dueño puede ver su propio historial. El INSERT lo hace el código de
-- sincronización: con la sesión del usuario cuando es el botón manual
-- "Sincronizar" (por eso hace falta el WITH CHECK de owner_id = auth.uid()),
-- o con la Service Role Key cuando es el cron nocturno (que salta RLS por
-- completo, así que no necesita esta política para funcionar).
CREATE POLICY transaction_sync_log_owner_read ON transaction_sync_log FOR SELECT USING (
  owner_id = auth.uid()
);
CREATE POLICY transaction_sync_log_owner_insert ON transaction_sync_log FOR INSERT WITH CHECK (
  owner_id = auth.uid()
);

GRANT SELECT, INSERT ON transaction_sync_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE transaction_sync_log_id_seq TO authenticated;
