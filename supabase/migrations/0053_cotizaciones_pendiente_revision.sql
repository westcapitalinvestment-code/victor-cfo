-- ============================================================================
-- VICTOR CFO — 0053: cotizaciones creadas por técnicos, pendientes de
-- aprobación del dueño
-- ----------------------------------------------------------------------------
-- Pedido de Joel (2 sept 2026): "si un cliente quiere algo nuevo el
-- empleado pudiera cotizarlo y guardarlo para que el jefe lo apruebe y se
-- lo envía como trabajo" — mismo patrón que invoices.pendiente_revision_
-- tecnico (migración 0048), pero para cotizaciones: cuando un técnico crea
-- una cotización desde cero en /tecnico, queda en estado 'borrador' con
-- pendiente_revision_tecnico = true hasta que el dueño la apruebe desde el
-- Panel de Equipo (pasa a estado 'enviada', lista para mandarla al cliente
-- por WhatsApp/PDF como cualquier otra cotización).
-- ============================================================================

ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS pendiente_revision_tecnico boolean DEFAULT false;
