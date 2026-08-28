CREATE TABLE citas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  fecha date NOT NULL,
  hora time,
  costo_estimado numeric,
  notas text,
  recordatorio_1dia boolean DEFAULT false,
  recordatorio_mismodia boolean DEFAULT false,
  hecha boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX citas_owner_fecha_idx ON citas (owner_id, fecha);

ALTER TABLE citas ENABLE ROW LEVEL SECURITY;

CREATE POLICY citas_access ON citas FOR ALL USING (owner_id = auth.uid());

GRANT ALL ON citas TO authenticated;
