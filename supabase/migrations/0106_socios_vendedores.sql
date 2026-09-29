-- ============================================================================
-- VICTOR CFO — 0106: Equipo de ventas por comisión ("vendedor") dentro del
-- Programa de Socios — 29 sept 2026
-- ============================================================================
-- Pedido de Joel: un equipo de ventas de campo, comisión pura, separado de
-- los "Embajadores" (cpa/influencer/otro, migración 0070) que ya usan esta
-- misma tabla. La diferencia NO es una tabla nueva — es el mismo `socios`
-- con un tercer valor en `tipo`, para que el resto del sistema (link de
-- postulación, código corto, aprobación del founder, cobro por ACH vía
-- payment_token de la migración 0071) se reuse tal cual. Lo único que
-- cambia de verdad es la MECÁNICA de la comisión (acordada con Joel en el
-- documento "Esquema de Comisiones — Equipo de Ventas VICTOR CFO"):
--   - Embajador (cpa/influencer/otro): $7 Core / $25 Pro, UNA sola vez,
--     como siempre.
--   - Vendedor: $50 de entrada (pago único, sube a $62.50 desde el 5to
--     cliente Pro pagando en el mismo mes calendario) + 10% de lo que el
--     cliente pague de verdad, cada uno de sus primeros 3 pagos — con
--     clawback de la entrada si el cliente cancela dentro de sus primeros
--     30 días (lógica en el webhook, no aquí).
--
-- socios_comisiones necesitaba poder tener MÁS de una fila por cliente
-- referido para esto (antes: referred_id UNIQUE, una fila para siempre).
-- Se reemplaza esa restricción por una compuesta que distingue tipo de
-- comisión + número de ciclo — así una fila de "entrada" (ciclo 0) y hasta
-- 3 de "recurrente" (ciclos 1-3) pueden coexistir para el mismo cliente,
-- sin volverse a duplicar si Stripe reintenta el mismo evento.
-- ============================================================================

ALTER TABLE socios
  DROP CONSTRAINT IF EXISTS socios_tipo_check,
  ADD CONSTRAINT socios_tipo_check CHECK (tipo IN ('cpa', 'influencer', 'otro', 'vendedor'));

ALTER TABLE socios_comisiones
  ADD COLUMN IF NOT EXISTS tipo_comision text NOT NULL DEFAULT 'entrada'
    CHECK (tipo_comision IN ('entrada', 'recurrente')),
  ADD COLUMN IF NOT EXISTS ciclo_numero integer NOT NULL DEFAULT 0;

-- Backfill: todas las filas existentes son comisiones de embajador de una
-- sola vez — quedan como tipo_comision='entrada', ciclo_numero=0 (los
-- defaults de arriba ya las dejan así, esto es solo explícito por claridad).
UPDATE socios_comisiones SET tipo_comision = 'entrada', ciclo_numero = 0
  WHERE tipo_comision IS NULL OR ciclo_numero IS NULL;

ALTER TABLE socios_comisiones
  DROP CONSTRAINT IF EXISTS socios_comisiones_referred_id_key,
  ADD CONSTRAINT socios_comisiones_referred_tipo_ciclo_key
    UNIQUE (referred_id, tipo_comision, ciclo_numero);

-- 'reversada' (clawback: cliente canceló dentro de sus primeros 30 días y
-- la comisión de entrada todavía no se le había pagado al vendedor) — solo
-- aplica a filas tipo_comision='entrada' de un socio tipo='vendedor'; para
-- embajadores nunca se usa este estado.
ALTER TABLE socios_comisiones
  DROP CONSTRAINT IF EXISTS socios_comisiones_estado_check,
  ADD CONSTRAINT socios_comisiones_estado_check CHECK (estado IN ('pendiente', 'pagada', 'reversada'));
