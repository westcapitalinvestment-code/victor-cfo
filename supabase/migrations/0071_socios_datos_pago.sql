-- ============================================================================
-- VICTOR CFO — 0071: Datos de pago ACH del Programa de Socios — 5 sept 2026
-- ============================================================================
-- El SSN/EIN del socio se deja para cuando cruce el umbral de la 1062.03
-- (ver comentario grande en 0070) — pero el banco/cuenta/ruta hace falta
-- desde el PRIMER pago, sin importar el monto, porque Joel paga por ACH
-- desde su cuenta de negocios de Mercury (no cheque, no cash). No se puede
-- diferir esto al umbral como el SSN.
--
-- Flujo (decisión de Joel, 5 sept 2026): el socio llena su propia info
-- bancaria en una página pública protegida por un token, NO Joel
-- escribiéndola a mano desde el panel — mismo principio que ya usa
-- cpa_invitations/admin_invitations (invitation_token uuid), pero aquí
-- sin cuenta/login de por medio, porque un socio externo (ej. un
-- influencer) no necesariamente es cliente de VICTOR CFO.
--
-- account_number/routing_number se cifran con lib/crypto.ts (AES-256-GCM,
-- mismo mecanismo que ya protege los access_token de Plaid) — nunca en
-- texto plano en la base de datos. account_last4 se guarda SIN cifrar a
-- propósito (no es sensible por sí solo) para que el panel de admin pueda
-- mostrar "···1234" sin tener que descifrar nada solo para confirmar de
-- un vistazo qué cuenta es.
ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS payment_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS account_number_encrypted text,
  ADD COLUMN IF NOT EXISTS routing_number_encrypted text,
  ADD COLUMN IF NOT EXISTS account_last4 text,
  ADD COLUMN IF NOT EXISTS datos_pago_completados_at timestamptz,
  -- Aceptación de app/socios/terminos/page.tsx al aplicar (5 sept 2026) —
  -- este programa es una relación de contratista independiente con
  -- terceros pagada en efectivo real, distinta del referido peer-to-peer
  -- (que solo necesita el T&S general de app/terminos/page.tsx), así que
  -- necesita su propia aceptación explícita registrada.
  ADD COLUMN IF NOT EXISTS terminos_aceptados_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS socios_payment_token_idx ON public.socios (payment_token);
