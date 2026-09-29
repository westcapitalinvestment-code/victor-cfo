import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================================
// Autenticación de la API pública v1 (/api/v1/*) — ver API.md en la raíz del
// proyecto para la documentación completa que se le puede pasar a un
// desarrollador externo o a Zapier.
//
// Mismo patrón de seguridad que lib/pin.ts: la key completa NUNCA se guarda
// en texto plano, solo su hash (SHA-256 + pepper de entorno). A diferencia
// del PIN (que es solo una traba de pantalla), una API key SÍ es el
// mecanismo real de autenticación de un endpoint público — así que aquí no
// hay "pepper legado" de compatibilidad: si API_KEY_PEPPER no está puesto
// en el entorno, se usa un default embebido (igual de débil que el legacy
// de PIN_PEPPER), pero no hace falta doble-checkeo porque las keys son
// nuevas — no hay ninguna guardada de antes de este cambio.
// ============================================================================

const API_KEY_PEPPER_DEFAULT = "victor-cfo-api-key-pepper-default";
const API_KEY_PEPPER = process.env.API_KEY_PEPPER || API_KEY_PEPPER_DEFAULT;

const KEY_PREFIX = "vcfo_live_";
// Caracteres base62 (sin ambigüedades tipo O/0, l/1 — más fácil de leer si
// alguna vez hay que transcribirla a mano).
const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomBase62(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += BASE62[bytes[i] % BASE62.length];
  }
  return out;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(`${key}:${API_KEY_PEPPER}`).digest("hex");
}

// Genera una API key nueva completa (vcfo_live_ + 32 caracteres base62) y su
// hash + prefijo visible, listos para guardar en la tabla api_keys. El
// valor de `key` es lo único que se le muestra al usuario — la ruta que
// llama a esto debe devolverlo en la respuesta UNA vez y nunca volver a
// guardarlo en ningún lado en texto plano.
export function generarApiKey(): { key: string; keyHash: string; prefijo: string } {
  const key = `${KEY_PREFIX}${randomBase62(32)}`;
  return {
    key,
    keyHash: hashApiKey(key),
    // Primeros 12 caracteres después del prefijo, para reconocerla en la
    // lista sin exponer la key completa.
    prefijo: key.slice(0, KEY_PREFIX.length + 12),
  };
}

export type ApiKeyScope = "clientes:leer" | "clientes:escribir" | "facturas:leer" | "facturas:escribir";

export type ApiAuthResult =
  | { ok: true; ownerId: string; entityId: string | null; scopes: string[]; apiKeyId: string }
  | { ok: false; status: number; error: string };

// Valida el header Authorization: Bearer <key> de una request a /api/v1/*.
// Devuelve el owner_id/entity_id/scopes de la key si es válida y no está
// revocada. La ruta que llama a esto es responsable de devolver el status
// (401/403) que trae el resultado si ok=false, y de chequear el scope que
// necesita ese endpoint específico.
export async function autenticarApiKey(request: Request): Promise<ApiAuthResult> {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Falta el header Authorization: Bearer <api key>." };
  }

  const key = header.slice("Bearer ".length).trim();
  if (!key.startsWith(KEY_PREFIX) || key.length < KEY_PREFIX.length + 16) {
    return { ok: false, status: 401, error: "Formato de API key inválido." };
  }

  const keyHash = hashApiKey(key);
  const admin = createAdminClient();
  const { data: apiKey, error } = await admin
    .from("api_keys")
    .select("id, owner_id, entity_id, scopes, revoked_at")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !apiKey) {
    return { ok: false, status: 401, error: "API key inválida o revocada." };
  }

  // Fire-and-forget — no bloquea la respuesta al caller ni falla la
  // request si esto no se pudo actualizar por lo que sea.
  admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKey.id)
    .then(
      () => {},
      () => {}
    );

  return {
    ok: true,
    ownerId: apiKey.owner_id as string,
    entityId: (apiKey.entity_id as string | null) ?? null,
    scopes: (apiKey.scopes as string[]) ?? [],
    apiKeyId: apiKey.id as string,
  };
}

// Chequeo de scope — cada ruta llama esto después de autenticarApiKey() con
// el scope que necesita ese endpoint específico.
export function tieneScope(scopes: string[], requerido: ApiKeyScope): boolean {
  return scopes.includes(requerido);
}
