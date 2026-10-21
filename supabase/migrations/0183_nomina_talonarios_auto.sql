-- 0183: envío automático de talonarios por correo al aprobar una corrida (21 oct 2026).
-- Apagado por defecto: el dueño lo enciende en Nómina → Tasas.
ALTER TABLE payroll_entity_config ADD COLUMN IF NOT EXISTS talonarios_auto boolean NOT NULL DEFAULT false;
