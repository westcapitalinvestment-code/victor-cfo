-- 0146 — El contable ve lo PERSONAL solo si el cliente lo autoriza
-- (10 oct 2026, pedido de Joel: "dividir personal de entidades, cada una con
-- sus tabs y reportes").
--
-- Hasta hoy transactions_cpa_read / goals_cpa_read / tax_estimate_settings_cpa_read
-- le daban al CPA lectura de TODAS las filas del dueño, incluidas las personales
-- (entity_id NULL) aunque el dueño nunca lo decidiera. Esta migración:
--   1) agrega account_members.share_personal (apagado por defecto, revocable);
--   2) re-crea esas 3 políticas: filas de entidad igual que antes; filas
--      personales (entity_id NULL) SOLO si share_personal = true;
--   3) agrega lectura CPA de documents y document_files PERSONALES, también
--      detrás de share_personal (las de entidad no se abren aquí).

ALTER TABLE account_members
  ADD COLUMN IF NOT EXISTS share_personal boolean NOT NULL DEFAULT false;

-- transactions
DROP POLICY IF EXISTS transactions_cpa_read ON transactions;
CREATE POLICY transactions_cpa_read ON transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = transactions.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa'
          AND (transactions.entity_id IS NOT NULL OR am.share_personal = true))
);

-- goals
DROP POLICY IF EXISTS goals_cpa_read ON goals;
CREATE POLICY goals_cpa_read ON goals FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = goals.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa'
          AND (goals.entity_id IS NOT NULL OR am.share_personal = true))
);

-- tax_estimate_settings (supersede 0145)
DROP POLICY IF EXISTS tax_estimate_settings_cpa_read ON tax_estimate_settings;
CREATE POLICY tax_estimate_settings_cpa_read ON tax_estimate_settings FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = tax_estimate_settings.owner_id
          AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa'
          AND (tax_estimate_settings.entity_id IS NOT NULL OR am.share_personal = true))
);

-- documents: solo personales (entity_id NULL) y solo con permiso
DROP POLICY IF EXISTS documents_cpa_read ON documents;
CREATE POLICY documents_cpa_read ON documents FOR SELECT USING (
  documents.entity_id IS NULL
  AND EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = documents.owner_id
              AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa'
              AND am.share_personal = true)
);

-- document_files: solo los de documentos personales
DROP POLICY IF EXISTS document_files_cpa_read ON document_files;
CREATE POLICY document_files_cpa_read ON document_files FOR SELECT USING (
  EXISTS (SELECT 1 FROM documents d
          JOIN account_members am ON am.owner_id = d.owner_id
          WHERE d.id = document_files.document_id
            AND d.entity_id IS NULL
            AND am.member_email = auth.email() AND am.active = true AND am.role = 'cpa'
            AND am.share_personal = true)
);

-- El dueño ya puede UPDATE su fila (account_members_owner_write, 0003), así
-- que el toggle se guarda con el cliente normal de Supabase.
