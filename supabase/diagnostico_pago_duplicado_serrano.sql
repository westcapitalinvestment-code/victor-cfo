-- SOLO LECTURA — confirma cuál de los 2 Payment Intents exitosos
-- (pi_3UM9RA4v59OjrkJT0QugIEta a las 4:35pm, o pi_3UM9Tx4v59OjrkJT1q4ti6nY
-- a las 4:38pm) es el que quedó guardado como el pago real de la factura
-- del Dr. Serrano — el que NO salga aquí es el que hay que reembolsar en
-- Stripe.
select
  i.numero,
  i.total,
  i.estado,
  i.fecha_pago,
  i.stripe_payment_intent,
  i.stripe_charge_id,
  i.fee_real,
  c.name as cliente
from invoices i
join clients c on c.id = i.client_id
where c.name ilike '%Serrano%'
  and i.total = 480.00
order by i.fecha_pago desc nulls last;
