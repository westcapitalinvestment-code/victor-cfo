-- Cuentas de negocio, fase 1 (1 sept 2026): plaid_accounts no tenía forma de
-- decir "esta cuenta es de la entidad X" — solo existía es_negocio (un
-- booleano de solo gating para Core/Pro, calculado una vez al conectar el
-- banco con pareceCuentaDeNegocio()). Bug real reportado por Joel: su login
-- de BPPR trae cuentas personales y de negocio juntas; al subir a Pro, la
-- cuenta de negocio se empezó a sincronizar pero sus transacciones caían con
-- entity_id NULL (hardcoded en lib/plaid-sync.ts) — es decir, se mezclaban
-- con Personal, porque Personal filtra transacciones con entity_id IS NULL
-- (ver app/dashboard/gastos/page.tsx línea ~163). Con esta columna, cada
-- cuenta se puede asignar a una entidad desde /dashboard/cuentas, y
-- lib/plaid-sync.ts ya puede resolver el entity_id correcto por cuenta al
-- guardar transacciones nuevas.
alter table plaid_accounts
  add column if not exists entity_id uuid references business_entities(id) on delete set null;
