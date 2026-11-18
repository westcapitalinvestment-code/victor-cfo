-- 0213 — Cobro con tarjeta por B2B Merchant (Authorize.Net), 18 nov 2026.
-- Alternativa a Stripe Connect: cada negocio pone las credenciales de SU
-- cuenta de Authorize.Net (la que le da B2B Merchant). Las llaves se guardan
-- cifradas con lib/crypto.ts (AES-256-GCM); el API Login ID no es secreto.
alter table public.business_entities
  add column if not exists authnet_api_login_id text,
  add column if not exists authnet_transaction_key_enc text,
  add column if not exists authnet_signature_key_enc text,
  add column if not exists authnet_ambiente text not null default 'sandbox'
    check (authnet_ambiente in ('sandbox', 'produccion')),
  add column if not exists authnet_activo boolean not null default false,
  add column if not exists authnet_webhook_id text;

-- Referencia que mandamos a Authorize.Net como order.invoiceNumber (máx. 20
-- caracteres) para casar el pago con la factura cuando llega el webhook.
alter table public.invoices
  add column if not exists authnet_ref text,
  add column if not exists authnet_transaction_id text;

create index if not exists invoices_authnet_ref_idx on public.invoices (authnet_ref) where authnet_ref is not null;
