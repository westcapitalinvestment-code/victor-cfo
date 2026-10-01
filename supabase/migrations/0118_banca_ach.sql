-- 30 sept 2026 — segunda mitad de lo que Joel pidió a raíz de su
-- conversación con el CPA Custom Gem: "crear los 2, uno para los
-- tecnologicos... y el NACHA para los que tiran ACH". Esto es la parte
-- NACHA — exportar un archivo .ach que Joel sube al portal de BPPR/
-- FirstBank/Oriental en vez de copiar/pegar nombre+monto a mano.
--
-- business_entities: la cuenta ORIGINADORA (de dónde sale el dinero).
-- vendors: la cuenta RECEPTORA de cada contratista (a dónde llega).
--
-- El número de cuenta se cifra a nivel de aplicación (lib/crypto.ts, mismo
-- cifrado AES-256-GCM que ya protege el access_token de Plaid) — el routing
-- number NO se cifra porque es información pública (identifica al banco,
-- no a la cuenta).

alter table business_entities
  add column if not exists ach_bank_name text,
  add column if not exists ach_routing_number text,
  add column if not exists ach_account_number_enc text,
  add column if not exists ach_account_type text default 'checking',
  add column if not exists ach_company_id text;

comment on column business_entities.ach_bank_name is
  'Nombre del banco originador para ACH (BPPR, FirstBank, Oriental, Otro) — solo para mostrarlo en pantalla, no afecta el archivo.';
comment on column business_entities.ach_routing_number is
  'Routing number (ABA) de 9 dígitos del banco originador. No es secreto.';
comment on column business_entities.ach_account_number_enc is
  'Número de cuenta ORIGINADORA cifrado a nivel de aplicación (lib/crypto.ts) — de aquí sale el dinero de cada pago NACHA.';
comment on column business_entities.ach_account_type is
  'checking | savings — tipo de la cuenta originadora.';
comment on column business_entities.ach_company_id is
  'Company Identification que asigna el banco para originar archivos ACH (a veces es 1 + EIN, a veces un número propio del banco) — Joel lo confirma con su banco antes del primer envío real.';

alter table vendors
  add column if not exists bank_routing_number text,
  add column if not exists bank_account_number_enc text,
  add column if not exists bank_account_type text default 'checking';

comment on column vendors.bank_routing_number is
  'Routing number (ABA) de 9 dígitos del banco del contratista, para el archivo NACHA. No es secreto.';
comment on column vendors.bank_account_number_enc is
  'Número de cuenta del contratista cifrado a nivel de aplicación (lib/crypto.ts) — a esta cuenta llega el pago vía el archivo NACHA.';
comment on column vendors.bank_account_type is
  'checking | savings — tipo de cuenta del contratista.';
