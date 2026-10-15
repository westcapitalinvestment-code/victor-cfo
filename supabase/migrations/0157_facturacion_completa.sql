-- 15 oct 2026 — Facturación "completa" (auditoría vs FreshBooks/QuickBooks).
-- (Nómina W-2 queda fuera de alcance a propósito.)
--
-- 1. Anular factura (void): estado = 'anulada'. Los montos se ponen en 0 para
--    que NINGÚN reporte/suma existente (pendiente, cobrado, IVU, retención)
--    se contamine; el monto original queda en total_original_anulada.
-- 2. Recordatorios automáticos de cobro vencido (cron + email).
-- 3. Portal en línea del cliente: token por cliente.
-- 4. Notas de crédito / reembolsos.

-- ── 1. Anular factura ───────────────────────────────────────────────────────
alter table invoices add column if not exists anulada_en timestamptz;
alter table invoices add column if not exists anulada_motivo text;
-- Montos originales (subtotal, ivu_monto, ivu_estatal_monto, ivu_municipal_monto,
-- retencion_monto, total, deposito_monto) para poder duplicar/auditar.
alter table invoices add column if not exists montos_originales_anulada jsonb;

-- ── 2. Recordatorios de cobro ───────────────────────────────────────────────
-- Apagado por defecto: el dueño decide si VICTOR le escribe a sus clientes.
alter table business_entities add column if not exists recordatorios_cobro_activos boolean not null default false;
alter table invoices add column if not exists ultimo_recordatorio_cobro_en timestamptz;
alter table invoices add column if not exists recordatorios_cobro_enviados integer not null default 0;

-- ── 3. Portal del cliente ───────────────────────────────────────────────────
alter table clients add column if not exists portal_token uuid not null default gen_random_uuid();
create unique index if not exists idx_clients_portal_token on clients (portal_token);

-- ── 4. Notas de crédito / reembolsos ────────────────────────────────────────
create table if not exists notas_credito (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  entity_id uuid references business_entities(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  numero text not null,
  tipo text not null default 'credito' check (tipo in ('credito', 'reembolso')),
  monto numeric(12,2) not null check (monto > 0),
  motivo text,
  fecha date not null default current_date,
  metodo_reembolso text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notas_credito_invoice on notas_credito (invoice_id);
create index if not exists idx_notas_credito_owner_fecha on notas_credito (owner_id, fecha);
create unique index if not exists idx_notas_credito_numero on notas_credito (owner_id, numero);

alter table notas_credito enable row level security;

drop policy if exists notas_credito_owner_admin_write on notas_credito;
create policy notas_credito_owner_admin_write on notas_credito for all using (
  owner_id = auth.uid()
  or exists (select 1 from account_members am where am.owner_id = notas_credito.owner_id
             and am.member_email = auth.email() and am.active = true and am.role = 'admin')
);

drop policy if exists notas_credito_cpa_read on notas_credito;
create policy notas_credito_cpa_read on notas_credito for select using (
  exists (select 1 from account_members am where am.owner_id = notas_credito.owner_id
          and am.member_email = auth.email() and am.active = true and am.role = 'cpa')
);
