-- 0095_seguimientos_clientes.sql (24 sept 2026)
-- "Seguimientos de clientes" — pedido de Joel al pensar cómo vender el
-- módulo de Facturación a negocios de mantenimiento (A/C, fumigación,
-- puertas de garaje, gas, quicklube, etc.): "negocio que no crece es por
-- falta de organización... el del A/C fue el 9 enero 2024 y no le he
-- realizado más ninguno... si ellos me hubieran llamado cada 6 meses
-- estarían facturando más". La idea final de Joel: cliente que entra al
-- negocio, queda grabado con sus datos, y VICTOR le da seguimiento
-- proactivo con recordatorios — no facturas ni cotizaciones frías.
--
-- Diseño: cada SERVICIO del catálogo puede declarar cada cuántos meses
-- debe darse seguimiento (ej. "Mantenimiento A/C" → 6 meses). Cuando una
-- factura de ese servicio se marca "pagada", se crea/actualiza un registro
-- de seguimiento con la próxima fecha. Un cron diario avisa al dueño
-- (push) y, si el cliente tiene email, le manda un recordatorio amistoso
-- (NO una factura/cotización — solo un "¿hace cuánto no te hacemos tu
-- mantenimiento?"). El link de WhatsApp queda preparado pero requiere un
-- toque humano — no hay integración real de WhatsApp Business API en esta
-- app (mismo límite documentado en el cron de facturas recurrentes).

-- Cada cuántos meses corresponde volver a contactar al cliente por este
-- servicio. NULL = este servicio no genera seguimiento (default, no
-- rompe nada de lo que ya existe).
ALTER TABLE services ADD COLUMN intervalo_seguimiento_meses integer;

CREATE TABLE seguimientos_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  factura_origen_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  fecha_servicio date NOT NULL,      -- cuándo se le hizo el último servicio
  fecha_proximo date NOT NULL,       -- cuándo le toca el próximo
  -- pendiente: esperando que llegue fecha_proximo o ya venció, sin contactar
  -- contactado: el dueño ya lo llamó/escribió, esperando respuesta
  -- agendado: ya hay cita coordinada (ver tabla citas)
  -- completado: se le volvió a facturar el servicio — ciclo cerrado
  -- descartado: el dueño decidió no darle más seguimiento a este ciclo
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'contactado', 'agendado', 'completado', 'descartado')),
  notas text,
  -- Para no mandar el mismo recordatorio todos los días una vez que ya
  -- venció — el cron solo reenvía cada 14 días mientras siga "pendiente".
  ultimo_recordatorio_enviado_en timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE seguimientos_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY seguimientos_clientes_access ON seguimientos_clientes FOR ALL USING (
  owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM account_members am WHERE am.owner_id = seguimientos_clientes.owner_id
             AND am.member_email = auth.email() AND am.active = true)
);

CREATE INDEX idx_seguimientos_owner ON seguimientos_clientes(owner_id);
CREATE INDEX idx_seguimientos_entity ON seguimientos_clientes(entity_id);
CREATE INDEX idx_seguimientos_client ON seguimientos_clientes(client_id);
CREATE INDEX idx_seguimientos_pendientes ON seguimientos_clientes(fecha_proximo) WHERE estado = 'pendiente';

-- Un cliente + servicio solo tiene UN seguimiento activo a la vez — si ya
-- existe uno pendiente/contactado/agendado para ese par, se actualiza en
-- vez de duplicar (ver lógica de la app en factura-detalle.tsx).
CREATE UNIQUE INDEX idx_seguimientos_activo_unico ON seguimientos_clientes(client_id, service_id)
  WHERE estado IN ('pendiente', 'contactado', 'agendado');
