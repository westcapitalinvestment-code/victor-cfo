-- ============================================================================
-- VICTOR CFO — 0027: un documento de la Bóveda puede tener VARIOS archivos
-- ============================================================================
-- Joel probó la subida de archivos a la Bóveda (Cloudflare R2, construida
-- directo sobre documents.r2_key) y preguntó: si toma 2-3 fotos del mismo
-- documento (ej. frente/atrás de una licencia, o varias páginas de un
-- contrato), ¿cómo distingue cuál es cuál? El modelo original solo
-- permitía 1 archivo por fila de `documents`.
--
-- Este cambio mueve los archivos a su propia tabla (document_files), donde
-- cada fila es UN archivo con una etiqueta opcional (ej. "Frente", "Página
-- 2") — así un documento puede tener 0, 1 o varios archivos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key text NOT NULL,
  etiqueta text, -- opcional: "Frente", "Atrás", "Página 2"... null = "Archivo N" en la UI
  orden int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_files ENABLE ROW LEVEL SECURITY;

-- Mismo patrón simple de RLS que el resto de la app: el dueño puede
-- ver/crear/editar/borrar sus propios archivos, nadie más.
CREATE POLICY document_files_all ON document_files
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON document_files TO authenticated;

CREATE INDEX IF NOT EXISTS document_files_document_id_idx ON document_files (document_id);

-- Migra lo que Joel ya subió hoy con el modelo viejo (1 archivo en
-- documents.r2_key) hacia la tabla nueva, para no perderlo.
INSERT INTO document_files (document_id, owner_id, r2_key, etiqueta, orden)
SELECT id, owner_id, r2_key, NULL, 0
FROM documents
WHERE r2_key IS NOT NULL;

-- documents.r2_key queda en la tabla (no se borra la columna, por si algo
-- todavía la lee) pero ya el código no la usa más — toda la lógica de
-- archivos vive en document_files de ahora en adelante.
