-- Compartir con el contable POR DOCUMENTO también en negocio (15 oct 2026,
-- pedido de Joel: "un toggle de compartir con contable pq hay cosas que se
-- comparten y otras no").
--
-- Antes (0152) el contable veía TODOS los documentos de las entidades que
-- tenía asignadas. Ahora, igual que en lo personal, solo ve los que tienen
-- compartir_contador = true. Para no cambiar lo que ya veía, los documentos
-- de negocio existentes se marcan como compartidos; el dueño puede apagar el
-- toggle en los que no quiere compartir.

UPDATE documents SET compartir_contador = true
WHERE entity_id IS NOT NULL AND compartir_contador = false;

DROP POLICY IF EXISTS documents_cpa_read ON documents;
CREATE POLICY documents_cpa_read ON documents FOR SELECT USING (
  documents.compartir_contador = true
  AND EXISTS (
    SELECT 1 FROM account_members am
    WHERE am.owner_id = documents.owner_id
      AND am.member_email = auth.email()
      AND am.active = true
      AND am.role = 'cpa'
      AND (
        (documents.entity_id IS NULL AND am.share_personal = true)
        OR
        (documents.entity_id IS NOT NULL AND (am.entity_id IS NULL OR am.entity_id = documents.entity_id))
      )
  )
);

DROP POLICY IF EXISTS document_files_cpa_read ON document_files;
CREATE POLICY document_files_cpa_read ON document_files FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM documents d
    JOIN account_members am ON am.owner_id = d.owner_id
    WHERE d.id = document_files.document_id
      AND d.compartir_contador = true
      AND am.member_email = auth.email()
      AND am.active = true
      AND am.role = 'cpa'
      AND (
        (d.entity_id IS NULL AND am.share_personal = true)
        OR
        (d.entity_id IS NOT NULL AND (am.entity_id IS NULL OR am.entity_id = d.entity_id))
      )
  )
);
