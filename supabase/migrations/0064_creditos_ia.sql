-- ============================================================================
-- VICTOR CFO — 0064: créditos de IA comprables (top-up de una vez, como hace
-- Anthropic con sus créditos de API). Pedido de Joel (3 sept 2026): "ese
-- limite lo podemos resolver poniendo un addon de creditos de AI".
-- ============================================================================
-- Decisión de Joel: (1) top-up de una vez vía Stripe Checkout en modo
-- "payment" (no suscripción) — se compra, se gasta, se compra otra vez
-- cuando se acabe; (2) se vende CON margen sobre el costo real de Anthropic
-- (ver app/api/stripe/checkout-creditos-ia/route.ts: $10 pagados = $7.00 de
-- presupuesto de IA añadido).
--
-- El crédito aplica SOLO al ciclo de facturación en el que se compra — no
-- se acumula de un ciclo a otro. Esto reusa exactamente la misma
-- ciclo_clave que ya usa uso_ia_mensual (migración 0026), así que un
-- usuario que compre créditos "hoy" los tiene disponibles de inmediato
-- (no se les aplica el ritmo-parejo del tope del plan — están ahí completos
-- en cuanto Stripe confirma el pago) — ver app/api/victor/route.ts.
--
-- creditos_ia_compras es la bitácora de auditoría (qué se pagó, cuándo, con
-- qué Checkout Session) — además de servirle a Joel para soporte/contabilidad,
-- protege contra que un reintento del webhook de Stripe duplique el crédito:
-- UNIQUE en stripe_checkout_session_id.
-- ============================================================================

CREATE TABLE IF NOT EXISTS creditos_ia_ciclo (
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ciclo_clave text NOT NULL, -- mismo formato que uso_ia_mensual.ciclo_clave
  credito_centavos numeric NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, ciclo_clave)
);

ALTER TABLE creditos_ia_ciclo ENABLE ROW LEVEL SECURITY;

-- El usuario puede ver su propio saldo de créditos del ciclo (para
-- mostrarlo en Configuración) — solo el webhook de Stripe (cliente admin,
-- que ignora RLS) puede escribirlo.
CREATE POLICY creditos_ia_ciclo_select ON creditos_ia_ciclo FOR SELECT USING (owner_id = auth.uid());

GRANT SELECT ON creditos_ia_ciclo TO authenticated;

CREATE TABLE IF NOT EXISTS creditos_ia_compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ciclo_clave text NOT NULL,
  credito_centavos numeric NOT NULL,
  precio_pagado_centavos integer NOT NULL,
  stripe_checkout_session_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creditos_ia_compras_owner_idx ON creditos_ia_compras (owner_id);

ALTER TABLE creditos_ia_compras ENABLE ROW LEVEL SECURITY;

CREATE POLICY creditos_ia_compras_select ON creditos_ia_compras FOR SELECT USING (owner_id = auth.uid());

GRANT SELECT ON creditos_ia_compras TO authenticated;
