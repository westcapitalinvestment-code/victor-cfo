-- 1 oct 2026, Fase 1 de "reconciliación contable real bruto/neto" (pedido de
-- Joel tras la sesión con el Gem CPA): hoy el "Gasto Procesamiento de Pagos"
-- en Reportes/Hacienda es 100% estimado (% fijo sobre el total de la
-- factura) — nunca lee el fee real que cobra Stripe o ATH Móvil Business.
-- Esta migración añade dónde guardar el fee REAL cuando lo tenemos (hoy
-- solo Stripe lo expone por API vía balance_transaction), dejando la puerta
-- abierta para Fase 2 (vincular esto a la transacción bancaria de Plaid).
alter table invoices add column if not exists stripe_charge_id text;
alter table invoices add column if not exists ath_ecommerce_id text;
alter table invoices add column if not exists fee_real numeric(10,2);
alter table invoices add column if not exists monto_neto_real numeric(10,2);
-- 'real' = vino de la API de la pasarela (hoy solo Stripe), 'estimado' =
-- seguimos sin tener el dato real (ATH, o si Stripe falló al expandir el
-- balance_transaction). NULL = factura no pagada por pasarela (cheque,
-- efectivo, transferencia, etc.) — no aplica.
alter table invoices add column if not exists fee_fuente text check (fee_fuente in ('real', 'estimado'));
