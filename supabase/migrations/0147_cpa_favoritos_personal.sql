-- 0147 — Favoritos "Mis clientes" también para la sección Personal del
-- Portal CPA (10 oct 2026, pedido de Joel: la lista Personal debe ser igual
-- a la de Entidades: buscador, Todos, Mis clientes, Con alertas).
-- Igual que cpa_client_favoritos (0140) pero por dueño (owner_id), porque lo
-- personal no tiene entidad. Por contable (member_email), nunca compartido.
CREATE TABLE IF NOT EXISTS cpa_personal_favoritos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_email text NOT NULL,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_email, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_cpa_personal_favoritos_member_email ON cpa_personal_favoritos(member_email);

ALTER TABLE cpa_personal_favoritos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cpa_personal_favoritos_self_all ON cpa_personal_favoritos;
CREATE POLICY cpa_personal_favoritos_self_all ON cpa_personal_favoritos FOR ALL USING (
  member_email = auth.email()
) WITH CHECK (
  member_email = auth.email()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON cpa_personal_favoritos TO authenticated;
