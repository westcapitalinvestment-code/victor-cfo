-- ============================================================================
-- VICTOR CFO — 0049: asignar cotizaciones a un técnico (Equipo v2, 2 sept
-- 2026). Joel: "probablemente sea una cotización que le dieron visto bueno
-- para hacerla o una factura" — ahora, igual que con Factura, el dueño
-- puede asignar una cotización APROBADA a un técnico de antemano, y el
-- técnico también puede verla en su app y convertirla él mismo a factura
-- real al terminar el trabajo (con evidencia y firma).
-- ============================================================================

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS technician_id uuid REFERENCES technicians(id) ON DELETE SET NULL;
