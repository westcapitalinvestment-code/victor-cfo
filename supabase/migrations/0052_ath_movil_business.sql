-- ============================================================================
-- VICTOR CFO — 0052: pATH de ATH Móvil Business por entidad (2 sept 2026,
-- pedido de Joel). ATH Business cobra 2.25% por pago recibido, mínimo
-- $0.06 (confirmado en ath.business/preguntas, sección "Límites y
-- cargos") — más barato que el estimado de Stripe (2.9% + $0.30) que ya
-- se muestra en Nueva/Editar Factura. El pATH es el identificador único
-- del negocio en ATH Móvil (siempre empieza con "/") — lo que el cliente
-- usa para pagarle, no el nombre del negocio.
-- ============================================================================

ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS ath_movil_business_path text;
