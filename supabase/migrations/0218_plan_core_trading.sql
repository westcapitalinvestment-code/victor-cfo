-- VICTOR CFO — 0218: plan Core + Trading (19 nov 2026).
-- trading_incluido: el precio que Stripe cobra es Core + Trading ($19.99/mes, $179/año).
-- trading_activo:   el usuario quiere ver el módulo en el menú (Pro/Business lo traen incluido).
-- nurture_trading_*: correos de la serie para traders (uno por columna, NULL = no enviado).
alter table public.users
  add column if not exists trading_incluido boolean not null default false,
  add column if not exists trading_activo boolean not null default false,
  add column if not exists nurture_trading_d1_at timestamptz,
  add column if not exists nurture_trading_d3_at timestamptz,
  add column if not exists nurture_trading_d14_at timestamptz,
  add column if not exists nurture_trading_negocio_at timestamptz;

-- Quien ya usa el guardián (tiene cuenta de trading) lo sigue viendo.
update public.users u set trading_activo = true
where exists (select 1 from public.trading_accounts a where a.owner_id = u.id);

notify pgrst, 'reload schema';
