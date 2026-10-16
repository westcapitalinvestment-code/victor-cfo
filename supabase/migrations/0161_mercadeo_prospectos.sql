-- 16 oct 2026: mercadeo por correo (prospectos B2B que publican su email para
-- recibir consultas). Solo el founder lo usa, vía service role (sin políticas
-- RLS a propósito: nadie más puede leer ni escribir estas tablas).
CREATE TABLE IF NOT EXISTS mkt_prospectos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  nombre text,
  empresa text,
  nota text,
  fuente text,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','enviado_1','enviado_2','respondio','baja','error')),
  error_detalle text,
  enviado_1_at timestamptz,
  enviado_2_at timestamptz,
  baja_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mkt_prospectos_email_uq ON mkt_prospectos (lower(email));
CREATE INDEX IF NOT EXISTS mkt_prospectos_estado_idx ON mkt_prospectos (estado);
ALTER TABLE mkt_prospectos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS mkt_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  activo boolean NOT NULL DEFAULT false,
  tope_diario integer NOT NULL DEFAULT 10,
  dias_seguimiento integer NOT NULL DEFAULT 5,
  direccion_fisica text NOT NULL DEFAULT '',
  asunto_1 text NOT NULL DEFAULT 'Una herramienta para facturar y cobrar más fácil en Puerto Rico',
  cuerpo_1 text NOT NULL DEFAULT E'Hola {{nombre}},\n\nVi que {{empresa}} recibe consultas por correo y quería presentarme: soy Joel, de VICTOR CFO, una plataforma de facturación, cobros y contabilidad hecha para pequeños negocios en Puerto Rico.\n\nTe permite enviar facturas, cobrar con tarjeta o ATH Móvil y darle a tu contable acceso directo a la información, sin pasarse archivos.\n\n¿Te parece si te la enseño en 15 minutos? Solo responde este correo y coordinamos.\n\nSaludos,\nJoel\nVICTOR CFO · www.victorcfo.com',
  asunto_2 text NOT NULL DEFAULT 'Re: Una herramienta para facturar y cobrar más fácil',
  cuerpo_2 text NOT NULL DEFAULT E'Hola {{nombre}},\n\nTe escribí hace unos días sobre VICTOR CFO. No quiero ser pesado, solo dejarte la puerta abierta: si te interesa verlo, responde este correo y te lo muestro en 15 minutos.\n\nSi no es el momento, no hay problema.\n\nSaludos,\nJoel',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mkt_config ENABLE ROW LEVEL SECURITY;
INSERT INTO mkt_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
