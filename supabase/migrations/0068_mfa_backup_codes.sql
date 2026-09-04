-- ============================================================================
-- VICTOR CFO — 0068: verificación en dos pasos (MFA) — códigos de respaldo
-- (4 sept 2026, pedido de Joel: "lo más urgente" del backlog — VICTOR
-- maneja datos bancarios reales vía Plaid y pagos vía Stripe Connect, y
-- hasta hoy el login era solo email+contraseña).
--
-- El factor TOTP (la app de autenticación — Google Authenticator, Authy,
-- etc.) lo maneja Supabase Auth internamente (auth.mfa_factors) vía
-- supabase.auth.mfa.enroll/challenge/verify/unenroll — no hace falta tabla
-- propia para eso. Lo único que SÍ necesita tabla propia son los CÓDIGOS DE
-- RESPALDO (10 de un solo uso, generados al activar MFA) — son un mecanismo
-- nuestro, no de Supabase, para cuando alguien pierde el celular con la app
-- de autenticación.
--
-- Diseño del hash: a diferencia del PIN de bloqueo (lib/pin.ts, SHA-256 +
-- pepper fijo, aceptable porque el PIN es solo una traba de pantalla), un
-- código de respaldo SÍ es una credencial real — es la puerta de emergencia
-- para entrar a la cuenta. Igual se usa SHA-256 + pepper (no bcrypt/argon2)
-- porque los códigos se generan con suficiente entropía propia (10
-- caracteres alfanuméricos aleatorios, ver lib/mfa-backup-codes.ts) y cada
-- uno es de un solo uso — no hay superficie de fuerza bruta razonable
-- contra un hash SHA-256 de un secreto de ese tamaño.
-- ============================================================================

CREATE TABLE mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_mfa_backup_codes_user ON mfa_backup_codes(user_id);
-- Único a nivel global, no solo por usuario — con la entropía real de cada
-- código (ver lib/mfa-backup-codes.ts) una colisión entre dos usuarios es
-- prácticamente imposible; esto es solo una segunda capa de seguridad.
CREATE UNIQUE INDEX idx_mfa_backup_codes_hash ON mfa_backup_codes(code_hash);

ALTER TABLE mfa_backup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_backup_codes_propio ON mfa_backup_codes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_backup_codes TO authenticated;
