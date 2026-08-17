-- ============================================================================
-- VICTOR CFO — 0007: tabla goals (Metas) — Core, pantalla "Inicio".
-- ============================================================================
-- No existía en 0001. Necesaria para la card "Metas" de la vista Personal
-- del Inicio (VICTOR — Dashboard Core.html): nombre, monto objetivo, monto
-- actual, barra de progreso. entity_id nullable porque las metas de Core
-- son personales (sin negocio todavía).
-- ============================================================================

CREATE TABLE goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE, -- null = meta personal
  name text NOT NULL,
  target_amount numeric NOT NULL,
  current_amount numeric DEFAULT 0,
  target_date date,
  status text DEFAULT 'activa',           -- activa | lograda | pausada
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY goals_access ON goals FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = goals.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

GRANT ALL ON goals TO authenticated;
