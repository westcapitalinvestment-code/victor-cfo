-- VICTOR CFO — 0226: registro del agente de comentarios de Facebook/Instagram (22 nov 2026).
-- Un renglón por comentario: evita contestarlo dos veces y deja el historial de
-- lo que hizo VICTOR (respondido, me_gusta, ocultado, avisado, ignorado, error).
CREATE TABLE IF NOT EXISTS meta_comentarios (
  comment_id text PRIMARY KEY,
  plataforma text NOT NULL CHECK (plataforma IN ('facebook','instagram')),
  post_id text,
  autor_id text,
  autor_nombre text,
  mensaje text NOT NULL,
  accion text NOT NULL,
  detalle text,
  ok boolean,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meta_comentarios_fecha_idx ON meta_comentarios (created_at DESC);
-- Solo el servidor (service_role) escribe y lee; sin acceso desde el navegador.
ALTER TABLE meta_comentarios ENABLE ROW LEVEL SECURITY;
GRANT ALL ON meta_comentarios TO service_role;
NOTIFY pgrst, 'reload schema';
