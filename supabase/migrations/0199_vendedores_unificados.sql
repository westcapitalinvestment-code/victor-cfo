-- ============================================================================
-- VICTOR CFO — 0199: Un solo programa de Vendedores — 1 nov 2026
-- ============================================================================
-- Pedido de Joel: vendedores de calle e influencers/socios pasan a ser todos
-- "vendedores", con la misma comisión (70% al primer pago real + 30% al 3er
-- pago). Solo 'cpa' queda aparte (sin comisión).
--
-- Los socios tipo 'influencer' y 'otro' (pendientes y aprobados) pasan a
-- 'vendedor'. Si alguno ya estaba aprobado y todavía no tiene PIN del portal,
-- hay que volver a darle "Aprobar" desde Ventas para que se le genere.
-- ============================================================================

UPDATE public.socios
   SET tipo = 'vendedor'
 WHERE tipo IN ('influencer', 'otro');
