-- ============================================================================
-- VICTOR CFO — 0139: Programa "Firma Accountant" (wholesale del plan Business)
-- (4 oct 2026, diseñado con Joel a partir de su negocio de facturación
-- médica: "le doy la oportunidad de ofrecer el mismo programa con todo
-- incluido... la idea es que ellos asuman la mensualidad y la incluyan en
-- los servicios de los clientes que contraten nuevos" — mismo mecanismo que
-- "bill my firm" (wholesale) de QuickBooks Online Accountant).
--
-- Cómo funciona (acordado en la conversación completa con Joel):
--  - Un contador/biller se registra como "Firma Accountant" (self-serve,
--    sin aprobación de Joel — a diferencia de Socios, aquí el contador nos
--    paga a NOSOTROS, no al revés, así que no hay exposición de fraude que
--    justifique gatear el registro). Solo pide Registro de Comerciante
--    (obligatorio) y Licencia de CPA (opcional — "no todos son CPA").
--  - Categoría separada y EXCLUYENTE del Programa de Socios (socios.sql,
--    migración 0070/0107/0135/0138): un contador es Firma Accountant O
--    Socio/vendedor con comisión, nunca las dos cosas para el mismo flujo.
--  - El contador invita a un cliente nuevo por email (firma_invitaciones,
--    mismo esqueleto que cpa_team_invitations de la migración 0137, pero
--    con un Stripe Checkout de por medio en la PRIMERA invitación). El
--    cliente acepta con su propio email/contraseña — USA VICTOR CFO
--    normal, todos los días, sabe que tiene la cuenta.
--  - El plan Business de ESE cliente queda 100% incluido en la factura de
--    la Firma — nunca se le cobra nada al cliente por el plan base. 20% de
--    descuento vs. precio de lista ($99.99 → $79.99/mes), facturado por
--    cantidad (1 subscription item con quantity = # de clientes activos)
--    en la suscripción propia de la Firma.
--  - Los addons (Técnicos, Administrador/Secretaria, Entidades
--    adicionales, Pagos) NO entran en el wholesale — siguen cobrándose
--    directo al cliente, a precio normal, como hoy (decisión explícita de
--    Joel: "los addons siempre al cliente").
--  - billed_by_firma_id es la columna que distingue a un cliente wholesale
--    de un cliente normal — mientras esté presente, el plan/plan_status de
--    ese usuario se marca activo SIN que exista una suscripción de Stripe
--    propia cubriendo el plan base.
-- ============================================================================

-- Firma Accountant — vive en el mismo `users` del contador (la misma
-- persona que ya puede tener acceso de solo-lectura vía account_members
-- role='cpa' a los clientes que LO invitaron a él). Nada de esto se
-- relaciona con el resolver de owner-efectivo (ese es para Admin/Secretaria,
-- que trabajan DENTRO de la cuenta de otro dueño — aquí el cliente siempre
-- es dueño de su propia cuenta, solo que no la paga él).
ALTER TABLE users ADD COLUMN IF NOT EXISTS es_firma_accountant boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS firma_registro_comerciante text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS firma_licencia_cpa text; -- opcional, no todos son CPA
ALTER TABLE users ADD COLUMN IF NOT EXISTS firma_stripe_customer_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS firma_stripe_subscription_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS firma_subscription_item_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS firma_seats_activos integer DEFAULT 0;

-- En el CLIENTE (quien recibe el servicio): si esta columna tiene un
-- valor, su plan Business lo paga la firma apuntada aquí, no él. Se deja
-- ON DELETE SET NULL (no CASCADE) a propósito — si la firma se elimina
-- algún día, el cliente no debe perder su cuenta de golpe; simplemente
-- queda sin quién le pague y VICTOR CFO decide manualmente qué hacer.
ALTER TABLE users ADD COLUMN IF NOT EXISTS billed_by_firma_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_billed_by_firma_id ON users(billed_by_firma_id) WHERE billed_by_firma_id IS NOT NULL;

-- Invitaciones de la Firma a clientes nuevos — mismo esqueleto que
-- cpa_team_invitations (0137): token, estado, email, se acepta creando
-- cuenta propia. La diferencia real está en el código (API), no en el
-- schema: aceptar esta invitación activa plan='proplus' pagado por la
-- firma, no un acceso de solo lectura a cuentas de otro.
CREATE TABLE IF NOT EXISTS firma_invitaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nombre_negocio text,
  email text NOT NULL,
  invitation_token uuid DEFAULT gen_random_uuid(),
  status text DEFAULT 'pending', -- pending | accepted | expired
  created_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_firma_invitaciones_firma_id ON firma_invitaciones(firma_id);
CREATE INDEX IF NOT EXISTS idx_firma_invitaciones_token ON firma_invitaciones(invitation_token);

ALTER TABLE firma_invitaciones ENABLE ROW LEVEL SECURITY;

-- La Firma ve y crea sus propias invitaciones. El cliente que acepta NO
-- necesita una política aquí — la ruta de aceptar usa el cliente admin
-- (service_role), igual que /api/cpa-invite/accept y /api/cpa-equipo/aceptar,
-- porque quien acepta nunca es dueño de la fila.
CREATE POLICY firma_invitaciones_firma_all ON firma_invitaciones FOR ALL USING (
  firma_id = auth.uid()
) WITH CHECK (
  firma_id = auth.uid()
);
