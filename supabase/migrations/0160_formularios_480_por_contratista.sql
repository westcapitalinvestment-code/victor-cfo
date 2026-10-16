-- 16 oct 2026: separar el PDF combinado de 480.6SP del contable en un formulario
-- por contratista, guardarlo en su expediente y enviárselo por correo.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS email text;

CREATE TABLE IF NOT EXISTS vendor_480_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  anio integer NOT NULL,
  r2_key text NOT NULL,
  enviado_en timestamptz,
  enviado_a text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_480_forms_vendor_idx ON vendor_480_forms (vendor_id, anio);
CREATE INDEX IF NOT EXISTS vendor_480_forms_owner_idx ON vendor_480_forms (owner_id);

ALTER TABLE vendor_480_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendor_480_forms_owner ON vendor_480_forms;
CREATE POLICY vendor_480_forms_owner ON vendor_480_forms
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
