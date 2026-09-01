-- Logo del negocio — para mostrarlo en el encabezado de facturas y
-- cotizaciones (PDF). Se guarda la key de R2, igual que los demás
-- archivos (invoice_attachments, document_files, etc.), no la imagen en sí.
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS logo_r2_key text;
