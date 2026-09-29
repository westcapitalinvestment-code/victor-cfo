-- ============================================================================
-- VICTOR CFO — 0107: Modelo de comisión 70/30 para vendedores + PIN del
-- portal — 29 sept 2026
-- ============================================================================
-- Reemplaza POR COMPLETO la mecánica de vendedor que trajo la migración
-- 0106 ($50 de entrada + 10%x3 ciclos con clawback de 30 días) — decisión
-- final de Joel tras revisar el esquema completo con el equipo de ventas.
-- La mecánica vieja NUNCA llegó a pagar comisiones reales (0106 se montó
-- el mismo día, 29 sept 2026), así que este reemplazo es limpio: no hay
-- filas viejas tipo_comision='entrada'/'recurrente' de vendedores que
-- reconciliar contra el modelo nuevo (los embajadores cpa/influencer/otro
-- SÍ siguen usando 'entrada' con su comisión única $7/$25 de siempre — eso
-- no cambia).
--
-- Modelo nuevo (solo aplica a socios tipo='vendedor', solo plan Pro):
--   1. Al primer pago real del cliente (invoice.paid, amount_paid>0 — ya
--      pasa hoy tras el trial de 30 días de los referidos de socios), el
--      vendedor cobra el 70% del precio MENSUAL EQUIVALENTE del plan del
--      cliente (mensual: 70% del precio mensual; anual: 70% de
--      precio_anual/12). Ese monto queda FIJO desde ese momento.
--   2. El 30% restante del MISMO monto base se libera SOLO si el cliente
--      llega vivo a su 3er mes pagando:
--        - Mensual: al 3er invoice.paid real de ese cliente (lo procesa
--          el webhook, ver procesarComisionVendedor en
--          app/api/stripe/webhook/route.ts).
--        - Anual: no hay 3 facturas en un año, así que se libera cuando
--          pasan 3 meses calendario desde el primer pago real, VERIFICANDO
--          en ese momento que la suscripción siga activa — lo hace un cron
--          nuevo, no el webhook (ver app/api/cron/liberar-comision-anual-vendedor).
--   3. Si el cliente cancela ANTES de llegar a ese hito, el 30% simplemente
--      nunca se paga — no hay clawback que revertir porque nunca se pagó
--      (a diferencia del $50 de entrada de la 0106, que si acababa de
--      pagarse SÍ había que revertir). El case
--      "customer.subscription.deleted" del webhook marca el 30%
--      'perdida' en vez de dejarlo 'pendiente' para siempre.
--   4. Después de liberarse (o perderse) el 30%, el ciclo de ESE cliente
--      se cierra para siempre — máximo un mes de plan repartido en dos
--      pagos, nunca más, sin importar cuántos años más pague.
--
-- socios_vendedor_clientes trackea el estado POR CLIENTE referido de un
-- vendedor (una fila por referred_id) — separado de socios_comisiones
-- (que sigue siendo el libro de comisiones EN SÍ, lo que Joel marca
-- 'pagada' cuando transfiere) porque acá se necesita guardar estado que no
-- tiene sentido en una fila de comisión individual: el ciclo del cliente,
-- cuántos pagos reales lleva contados, y si el 30% sigue pendiente.
-- ============================================================================

-- PIN del portal del vendedor (/socios/portal) — mismo patrón que
-- technicians.pin_hash (migración 0003): SHA-256+pepper vía lib/pin.ts, no
-- Supabase Auth. Se genera junto con el código corto al aprobar (ver
-- app/api/socios/[id]/route.ts). NULL para embajadores (cpa/influencer/
-- otro) — nunca tienen portal, solo el link de aplicación pública.
ALTER TABLE socios
  ADD COLUMN IF NOT EXISTS pin_hash text;

-- tipo_comision ahora también admite 'setenta'/'treinta' (modelo nuevo de
-- vendedor) además de 'entrada'/'recurrente' (embajadores, sin cambios, y
-- el vendedor viejo de la 0106 que nunca se usó de verdad).
ALTER TABLE socios_comisiones
  DROP CONSTRAINT IF EXISTS socios_comisiones_tipo_comision_check,
  ADD CONSTRAINT socios_comisiones_tipo_comision_check
    CHECK (tipo_comision IN ('entrada', 'recurrente', 'setenta', 'treinta'));

-- Estado por cliente referido de un vendedor — una fila por referred_id,
-- creada en el primer pago real y actualizada hasta que el 30% se libera
-- o se pierde.
CREATE TABLE IF NOT EXISTS socios_vendedor_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id uuid NOT NULL REFERENCES public.socios(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  -- 'mensual' o 'anual' — determinado por el intervalo del price de
  -- Stripe en el momento del primer pago real; define si el 30% se libera
  -- por 3er invoice.paid (mensual) o por el cron de 3 meses (anual).
  ciclo text NOT NULL CHECK (ciclo IN ('mensual', 'anual')),
  primer_pago_at timestamptz NOT NULL DEFAULT now(),
  -- Montos FIJOS calculados una sola vez en el primer pago real — nunca se
  -- recalculan aunque el precio de Pro cambie después.
  setenta_centavos integer NOT NULL,
  treinta_centavos integer NOT NULL,
  -- Cuántos invoice.paid reales del cliente se han contado (empieza en 1
  -- con el primer pago que crea esta fila) — solo se usa para el caso
  -- mensual, el anual lo resuelve el cron por fecha.
  pagos_reales_contados integer NOT NULL DEFAULT 1,
  treinta_estado text NOT NULL DEFAULT 'pendiente' CHECK (treinta_estado IN ('pendiente', 'liberada', 'perdida')),
  treinta_liberada_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS socios_vendedor_clientes_socio_id_idx ON socios_vendedor_clientes (socio_id);
-- Usado por el cron anual: candidatos = ciclo='anual' AND treinta_estado='pendiente', filtrado por fecha.
CREATE INDEX IF NOT EXISTS socios_vendedor_clientes_pendientes_idx
  ON socios_vendedor_clientes (ciclo, treinta_estado, primer_pago_at)
  WHERE treinta_estado = 'pendiente';

ALTER TABLE socios_vendedor_clientes ENABLE ROW LEVEL SECURITY;
-- Sin políticas USING (mismo patrón que socios/socios_comisiones) — con
-- RLS encendido y ninguna policy, solo el cliente admin/service_role (el
-- webhook, el cron, y las rutas /api/socios/portal/*) puede leer/escribir.
