-- Bóveda compartida con el contable (15 oct 2026, pedido de Joel: "que el
-- contable le suba documentos y los renueve; VICTOR le avisa al usuario y las
-- alertas las ve el contable").
--
-- 1) documents: marca de quién subió el documento (para el badge "Subido por
--    tu contable" en la Bóveda del dueño).
-- 2) RLS de lectura del contable: antes solo veía documentos PERSONALES con
--    compartir_contador = true. Ahora también ve los documentos de NEGOCIO de
--    las entidades que el cliente le dio (account_members.entity_id NULL =
--    todas las entidades del dueño, o igual a la entidad del documento).
--    La ESCRITURA del contable NO pasa por RLS: va por /api/cpa/boveda con
--    service role tras comprobar el permiso explícitamente.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS subido_por_contable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subido_por_email text;

DROP POLICY IF EXISTS documents_cpa_read ON documents;
CREATE POLICY documents_cpa_read ON documents FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM account_members am
    WHERE am.owner_id = documents.owner_id
      AND am.member_email = auth.email()
      AND am.active = true
      AND am.role = 'cpa'
      AND (
        (documents.entity_id IS NULL AND documents.compartir_contador = true AND am.share_personal = true)
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
      AND am.member_email = auth.email()
      AND am.active = true
      AND am.role = 'cpa'
      AND (
        (d.entity_id IS NULL AND d.compartir_contador = true AND am.share_personal = true)
        OR
        (d.entity_id IS NOT NULL AND (am.entity_id IS NULL OR am.entity_id = d.entity_id))
      )
  )
);
