-- 0096_seguimientos_tecnico.sql (24 sept 2026)
-- Extiende "Seguimientos de clientes" (0095) con lo que Joel pidió después
-- de probarlo en la demo: "cuando se acumulen va a haber trabajo de más...
-- debe tener un botón de pendiente con nota... y creo que también debe
-- tener algo como para asignarlo a técnico como tarea pendiente".
--
-- Mismo patrón exacto que ya existe para cotizaciones (0049) y facturas
-- (0048): una columna technician_id que referencia technicians. El dueño
-- asigna el seguimiento a un técnico desde el dashboard, y el técnico lo ve
-- en su app (sección nueva "Seguimientos asignados") y puede actuar sobre
-- él (marcar contactado / dejar nota / descartar) sin pasar por el dueño.
--
-- Gate del addon (Joel, tras aclarar): "si es un solo miembro lo pueda
-- hacer, si tiene equipo pues le vendemos el addon" — es decir, el botón de
-- nota/pendiente NO depende de técnicos (cualquier negocio solo lo
-- necesita), pero ASIGNAR el seguimiento a un técnico sí queda detrás del
-- mismo addon de pago de Equipo ($20/mes) que ya gatea Facturas y
-- Cotizaciones — se aplica en el código (nueva-factura-form.tsx ya tiene
-- el patrón), no en esta migración.
--
-- La nota (columna `notas`, ya existía desde 0095 pero sin UI) ahora se usa
-- también para el botón "Pendiente (nota)": el dueño o el técnico escriben
-- algo como "de viaje, llamar la próxima semana" sin que eso cambie el
-- estado a "contactado" — el seguimiento se queda activo y visible.

ALTER TABLE seguimientos_clientes ADD COLUMN IF NOT EXISTS technician_id uuid REFERENCES technicians(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_seguimientos_technician ON seguimientos_clientes(technician_id);
