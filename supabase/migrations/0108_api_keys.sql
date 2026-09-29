-- ============================================================================
-- VICTOR CFO — 0108: tabla api_keys (base de la API pública v1)
-- ============================================================================
-- Primer paso hacia integraciones externas (Zapier, Shopify, etc. — a
-- futuro, NO en este cambio): una API pública genérica autenticada por API
-- key, con los dos recursos que más valor tienen para "gente facturando
-- con IA y comercios digitales" — Clientes y Facturas. Pagos, Transacciones
-- y Personal quedan fuera de v1 a propósito.
--
-- Igual que PIN (lib/pin.ts) y los tokens de sesión del técnico, la API key
-- completa NUNCA se guarda en texto plano — solo su hash (SHA-256 + pepper
-- de entorno, ver lib/api-auth.ts). El valor completo se le muestra al
-- usuario UNA sola vez, al momento de generarla, y no se puede recuperar
-- después — solo revocar y generar una nueva.
--
-- key_hash es la fuente de verdad para autenticar cada request; prefijo es
-- puramente cosmético (para que el usuario reconozca "cuál era esa key" en
-- la lista sin tener que guardarla aparte).
--
-- entity_id nullable = la key aplica a TODAS las entidades del owner (igual
-- que account_members.entity_id, mismo patrón de "null = todo"). Si se fija
-- a una entidad específica, cada request con esa key queda automáticamente
-- limitado a esa entidad sin que la integración externa tenga que mandar
-- el entity_id cada vez (y sin poder ver las demás entidades del owner
-- aunque lo intente).
--
-- scopes es text[] en vez de una tabla de permisos aparte — v1 solo usa
-- 4 scopes fijos (clientes:leer, clientes:escribir, facturas:leer,
-- facturas:escribir) pero un array de texto no necesita migración nueva
-- para agregar scopes futuros (ej. pagos:leer cuando se exponga ese
-- recurso), a diferencia de un enum de Postgres.
-- ============================================================================

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES business_entities(id) ON DELETE CASCADE, -- null = todas las entidades del owner
  nombre text NOT NULL,
  prefijo text NOT NULL,       -- ej. "vcfo_live_A1b2C3d4" — primeros caracteres visibles, para reconocerla en la lista
  key_hash text NOT NULL,      -- SHA-256(key completa + API_KEY_PEPPER) — nunca la key en texto plano
  scopes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
-- Sin políticas USING a propósito — mismo patrón que referral_rewards
-- (0062) y otras tablas de bookkeeping interno: solo el service_role
-- (cliente admin, lib/supabase/admin.ts) toca esta tabla directamente,
-- tanto para la UI de gestión (app/dashboard/config/api-keys) como para
-- validar requests entrantes en lib/api-auth.ts. Ningún usuario ve las
-- keys de otro por RLS de cliente porque el cliente nunca consulta esta
-- tabla directamente — todo pasa por rutas server-side con el admin
-- client, filtrando siempre por owner_id = auth.uid() en el código.

CREATE INDEX idx_api_keys_owner ON api_keys(owner_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_entity ON api_keys(entity_id) WHERE entity_id IS NOT NULL;
