-- Favoritos por contable dentro del Portal CPA (4 oct 2026, pedido de Joel
-- a nombre de su esposa): cuando un líder de firma (ej. Héctor) invita a
-- otro contable (ej. Josué) vía /cpa/equipo (migración 0137), hoy Josué ve
-- EXACTAMENTE la misma cartera completa que Héctor — no hay forma de que
-- cada contable se enfoque visualmente en los clientes que trabaja. Joel
-- quiere: tab "Todos" (la cartera completa, como hoy) + tab "Mis clientes"
-- (solo los que ese contable marcó con una estrellita como favoritos), para
-- que cada uno se organice, pero SIN restringir acceso — si alguien falta o
-- se enferma, cualquier otro contable del equipo puede buscar el cliente en
-- "Todos" y trabajarlo igual. Es organización visual, no un permiso nuevo.
--
-- Por diseño, el favorito es POR CONTABLE (member_email), nunca compartido
-- entre el equipo — cada uno marca los suyos independientemente.
CREATE TABLE IF NOT EXISTS cpa_client_favoritos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_email text NOT NULL,
  entity_id uuid NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_email, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_cpa_client_favoritos_member_email ON cpa_client_favoritos(member_email);

ALTER TABLE cpa_client_favoritos ENABLE ROW LEVEL SECURITY;

-- Mismo patrón que account_members_self_read (migración 0003): el contable
-- solo puede ver/crear/borrar SUS PROPIOS favoritos, comparando por el email
-- de su sesión de Supabase Auth — nunca el email de otro contable.
CREATE POLICY cpa_client_favoritos_self_all ON cpa_client_favoritos FOR ALL USING (
  member_email = auth.email()
) WITH CHECK (
  member_email = auth.email()
);
