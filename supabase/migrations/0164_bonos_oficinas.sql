-- ============================================================================
-- VICTOR CFO — 0164: Bonos de oficinas de contables para vendedores
-- — 18 oct 2026
-- ============================================================================
-- Acordado con Joel: cuando un vendedor activa una oficina de contables en el
-- portal y esa oficina trae clientes a VICTOR, el vendedor cobra un bono:
--   * $20 UNA sola vez por oficina, cuando el primer cliente referido por la
--     oficina ya pagó (bono_oficina).
--   * $10 UNA sola vez por cada cliente referido por la oficina que ya pagó y
--     sigue activo (bono_cliente).
-- Se pagan cada 3 meses (trimestre calendario). Los bonos viven en la misma
-- tabla socios_comisiones que el resto de las comisiones del vendedor, así
-- que heredan el estado pendiente/pagada/reversada, la retención 1062.03 y los
-- totales del panel de Ventas sin tocar nada más. La cuenta del vendedor y de
-- la oficina se fija en oficinas_contables.socio_id (el vendedor que la activó).
--
-- Un cliente "referido por la oficina" es uno de estos dos:
--   (a) invitado por el contable con Firma Accountant (users.billed_by_firma_id
--       = id del contable) y con plan activo.
--   (b) registrado con el código de socio del contable (users.referido_por_
--       socio_id apunta a un socio cuyo owner_user_id es el contable) y que ya
--       generó su primera comisión (o sea, ya pagó).
-- Nunca se paga un cliente que el mismo vendedor trajo directo.
-- ============================================================================

ALTER TABLE public.socios_comisiones
  DROP CONSTRAINT IF EXISTS socios_comisiones_tipo_comision_check,
  ADD CONSTRAINT socios_comisiones_tipo_comision_check
    CHECK (tipo_comision IN ('entrada', 'recurrente', 'setenta', 'treinta', 'unica', 'bono_oficina', 'bono_cliente'));

-- Qué oficina originó cada bono (para agrupar en los paneles).
ALTER TABLE public.socios_comisiones
  ADD COLUMN IF NOT EXISTS oficina_id uuid REFERENCES public.oficinas_contables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS socios_comisiones_oficina_idx ON public.socios_comisiones (oficina_id) WHERE oficina_id IS NOT NULL;
