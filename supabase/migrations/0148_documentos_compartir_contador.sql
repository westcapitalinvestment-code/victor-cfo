-- 0148 — El dueño decide, documento por documento, cuáles ve su contable
-- (10 oct 2026, Joel: "en la bóveda tengo el marbete de los carros y un pago
-- de una tarjeta y eso no le interesa al contable").
-- Antes (0146) el contable con "compartir personal" veía TODOS los documentos
-- personales. Ahora además cada documento debe estar marcado explícitamente
-- (compartir_contador = true). Apagado por defecto.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS compartir_contador boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS documents_cpa_read ON documents;
CREATE POLICY documents_cpa_read ON documents FOR SELECT USING (
  documents.entity_id IS NULL
  AND documents.compartir_contador = true
  AND EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = documents.owner_id
              AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa'
              AND am.share_personal = true)
);

DROP POLICY IF EXISTS document_files_cpa_read ON document_files;
CREATE POLICY document_files_cpa_read ON document_files FOR SELECT USING (
  EXISTS (SELECT 1 FROM documents d
          JOIN account_members am ON am.owner_id = d.owner_id
          WHERE d.id = document_files.document_id
            AND d.entity_id IS NULL
            AND d.compartir_contador = true
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa'
            AND am.share_personal = true)
);
