-- ============================================================================
-- VICTOR CFO — 0103: índices de escalabilidad (28 sept 2026, pedido de Joel:
-- "podemos escalar a miles de clientes y cada cliente puede tener cientos o
-- miles de clientes también, todo el sistema soporta?").
--
-- Investigando esa pregunta encontré un hueco real: Postgres crea un índice
-- automático solo en la llave primaria (id) y en columnas UNIQUE — NUNCA en
-- foreign keys por defecto. Casi todas las consultas de la app filtran por
-- owner_id (y muchas también por entity_id y/o fecha), y esas columnas NO
-- tenían índice explícito en las tablas más consultadas (transactions,
-- invoices, clients, cotizaciones, goals, documents, manual_accounts,
-- plaid_accounts). Con los datos de hoy (un puñado de usuarios de prueba)
-- esto es invisible — Postgres hace un "sequential scan" en unas pocas
-- filas en milisegundos. Con miles de dueños de negocio, cada uno con
-- cientos/miles de sus propios clientes y transacciones, esas mismas
-- consultas se vuelven progresivamente más lentas sin que nada se rompa de
-- golpe — justo el tipo de problema que conviene prevenir ANTES de tener
-- volumen real, no después.
--
-- account_members también se indexa aquí: su patrón de RLS
-- "owner_id = auth.uid() OR EXISTS (SELECT 1 FROM account_members ...
-- WHERE am.owner_id = X.owner_id AND am.member_email = auth.email())" se
-- repite en varias tablas (goals, etc.) — sin índice, esa subconsulta EXISTS
-- también escanea toda la tabla en cada chequeo de fila.
--
-- Es un cambio puramente de infraestructura: no toca código de la app, no
-- cambia ningún comportamiento, no requiere downtime. CREATE INDEX IF NOT
-- EXISTS es seguro de correr más de una vez.
-- ============================================================================

-- transactions — la tabla más consultada de toda la app (Inicio, Gastos,
-- Reportes, VICTOR, las 5 alertas nuevas de resumen-reglas-card). Casi
-- todas las queries filtran owner_id + entity_id (o entity_id IS NULL para
-- personal) + rango de fecha.
CREATE INDEX IF NOT EXISTS idx_transactions_owner_entity_fecha
  ON transactions (owner_id, entity_id, fecha);

-- Bandeja de "sin categorizar" (Inicio + Gastos + VICTOR) — filtra
-- específicamente hacienda_category_id IS NULL. Índice parcial: solo indexa
-- las filas pendientes, que siempre son un subconjunto pequeño del total.
CREATE INDEX IF NOT EXISTS idx_transactions_owner_sin_categorizar
  ON transactions (owner_id, fecha)
  WHERE hacienda_category_id IS NULL;

-- invoices — Facturación, Cobros, Reportes, el nuevo QR/Cobro Rápido.
CREATE INDEX IF NOT EXISTS idx_invoices_owner_entity_fecha
  ON invoices (owner_id, entity_id, fecha_emision);

CREATE INDEX IF NOT EXISTS idx_invoices_owner_estado
  ON invoices (owner_id, estado);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
  ON invoice_items (invoice_id);

-- cotizaciones — mismo patrón que invoices.
CREATE INDEX IF NOT EXISTS idx_cotizaciones_owner_entity
  ON cotizaciones (owner_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_cotizacion_items_cotizacion
  ON cotizacion_items (cotizacion_id);

-- clients — cada negocio puede tener cientos/miles; se listan y filtran
-- constantemente en Facturación (combobox de cliente, importaciones, etc.).
CREATE INDEX IF NOT EXISTS idx_clients_owner_entity
  ON clients (owner_id, entity_id);

-- goals — Inicio (Metas) y la nueva alerta de "meta estancada" (28 sept),
-- que ordena por updated_at.
CREATE INDEX IF NOT EXISTS idx_goals_owner_entity_status
  ON goals (owner_id, entity_id, status);

CREATE INDEX IF NOT EXISTS idx_goals_owner_updated_at
  ON goals (owner_id, updated_at);

-- documents (Bóveda) — la alerta de "por vencer" en Inicio filtra por
-- fecha_vencimiento y estado='activo' en cada carga del dashboard.
CREATE INDEX IF NOT EXISTS idx_documents_owner_vencimiento
  ON documents (owner_id, fecha_vencimiento)
  WHERE estado = 'activo';

-- Cuentas (Plaid y manuales) — balance/Ahorrado/Deuda/Inversiones en Inicio,
-- filtradas por owner_id + entity_id en cada carga.
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_owner_entity
  ON plaid_accounts (owner_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_manual_accounts_owner_entity
  ON manual_accounts (owner_id, entity_id);

-- account_members — respalda el patrón de RLS "... OR EXISTS (SELECT 1 FROM
-- account_members WHERE owner_id = X.owner_id AND member_email = ...)" que
-- usan goals y otras tablas compartidas con CPA/Admin.
CREATE INDEX IF NOT EXISTS idx_account_members_owner
  ON account_members (owner_id);

CREATE INDEX IF NOT EXISTS idx_account_members_email_active
  ON account_members (member_email, active);
