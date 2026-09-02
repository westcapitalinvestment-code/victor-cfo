-- ============================================================================
-- VICTOR CFO — 0048: Equipo v2 — el técnico crea FACTURAS REALES, no un
-- registro aparte. Reemplaza el enfoque de 0003 (technician_visits) después
-- de que Joel compartió su mockup real de "Modo Equipo" (2 sept 2026): el
-- técnico completa un trabajo y eso debe aparecer en Facturación de verdad
-- (mandarse al cliente, contar en reportes de ingresos), no vivir aparte.
--
-- Las tablas technician_visits/technician_visit_items/technician_service_
-- catalog de la migración 0003 se DEJAN EN LA BASE DE DATOS sin usar (no se
-- borran — no hay filas reales todavía y borrar tablas es innecesariamente
-- arriesgado). El catálogo de servicios del técnico ahora es el mismo
-- `services` que ya usa Facturación (pedido de Joel: "los técnicos y
-- servicios deben aparecer los que se entraron en pagos y facturas pq
-- quizás son los mismos") — technician_service_catalog queda sin usar.
-- ============================================================================

-- invoices: quién hizo el trabajo (si lo originó un técnico) y si está
-- pendiente de que el dueño la apruebe antes de "salir" al cliente.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS technician_id uuid REFERENCES technicians(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pendiente_revision_tecnico boolean DEFAULT false;
-- Descuento que puede aplicar el técnico en campo, dentro del tope que le
-- configure el dueño (technicians.max_discount_pct / el default global de
-- la entidad). Se resta del total ya con IVU aplicado, no del subtotal —
-- más simple de razonar y de mostrar en el desglose.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS descuento_pct numeric DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS descuento_monto numeric DEFAULT 0;

-- technicians: vínculo opcional con vendors (Pagos) — pedido de Joel: si el
-- técnico también es alguien a quien le paga con retención 480.6, debe ser
-- LA MISMA persona/registro en vez de crearlo dos veces. No se fuerza
-- (ON DELETE SET NULL) porque un técnico puede no ser un contratista pagado
-- por 480.6 (ej. empleado W-2, familiar, etc.).
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL;

-- business_entities: valores default de Equipo a nivel de negocio (lo que
-- el mockup de Joel muestra en Config → "Modo Equipo" → "Qué puede hacer el
-- técnico"). Cada técnico puede seguir este default (technicians.
-- approval_mode = NULL) o tener su propio override explícito ('auto' /
-- 'manual').
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS equipo_aprobacion_default text DEFAULT 'auto';
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS equipo_tecnico_ve_precios boolean DEFAULT true;
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS equipo_tecnico_cobra_vencidas boolean DEFAULT true;
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS equipo_tecnico_anade_clientes boolean DEFAULT true;
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS equipo_tecnico_aplica_descuento boolean DEFAULT false;
ALTER TABLE business_entities ADD COLUMN IF NOT EXISTS equipo_tecnico_descuento_max_pct numeric DEFAULT 0;

-- El approval_mode de un técnico ahora puede ser NULL ("sigue el default
-- global de la entidad") — la columna ya era nullable (solo tenía DEFAULT
-- 'auto', sin NOT NULL), así que no hace falta ALTER de nulabilidad, solo
-- se deja de forzar 'auto' al crear un técnico nuevo desde la app.
