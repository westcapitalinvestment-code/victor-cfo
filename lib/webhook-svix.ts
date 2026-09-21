import { createHmac, timingSafeEqual } from "crypto";

// Verificación manual de webhooks firmados con Svix (así firma Resend sus
// webhooks — Stripe usa su propio esquema aparte, ver lib/stripe.ts). No
// instalamos el paquete `svix` (el proyecto ya trae `resend` a mano y no
// queríamos meter una dependencia nueva solo para esto) — el algoritmo es
// público y simple: https://docs.svix.com/receiving/verifying-payloads/how-manual
//
// Usado por app/api/soporte/inbound (correos entrantes a soporte@victorcfo.com,
// 21 sept 2026). Si el proyecto suma más webhooks firmados con Svix en el
// futuro, este mismo helper sirve para esos también.
//
// IMPORTANTE: `payload` debe ser el body crudo (string), tal cual llegó en
// la petición — NUNCA el resultado de JSON.parse(...) y volver a
// stringify, porque la firma es sensible a cualquier diferencia de
// espacios/orden de llaves que introduzca eso.
export function verificarFirmaSvix(params: {
  payload: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  secret: string;
}): { valido: boolean; motivo?: string } {
  const { payload, svixId, svixTimestamp, svixSignature, secret } = params;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valido: false, motivo: "Faltan los headers svix-id/svix-timestamp/svix-signature." };
  }

  // Ventana anti-replay — Svix recomienda rechazar timestamps fuera de un
  // rango razonable (un atacante con una petición firmada interceptada de
  // hace días no debería poder reenviarla y que pase como válida).
  const timestampSegundos = Number(svixTimestamp);
  if (!Number.isFinite(timestampSegundos)) {
    return { valido: false, motivo: "svix-timestamp inválido." };
  }
  const diferenciaSegundos = Math.abs(Date.now() / 1000 - timestampSegundos);
  const TOLERANCIA_SEGUNDOS = 5 * 60;
  if (diferenciaSegundos > TOLERANCIA_SEGUNDOS) {
    return { valido: false, motivo: "svix-timestamp fuera de la ventana permitida (posible replay)." };
  }

  // El secreto viene como "whsec_<base64>" — solo la parte después del
  // prefijo está codificada en base64.
  const secretSinPrefijo = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const secretBytes = Buffer.from(secretSinPrefijo, "base64");

  const contenidoFirmado = `${svixId}.${svixTimestamp}.${payload}`;
  const firmaEsperada = createHmac("sha256", secretBytes).update(contenidoFirmado, "utf8").digest();

  // svix-signature puede traer varias firmas separadas por espacio (ej. si
  // el endpoint tiene más de un secreto activo durante una rotación), cada
  // una con el formato "v1,<base64>". Basta con que UNA calce.
  const candidatos = svixSignature.split(" ").filter(Boolean);
  for (const candidato of candidatos) {
    const [version, firmaBase64] = candidato.split(",");
    if (version !== "v1" || !firmaBase64) continue;
    let firmaRecibida: Buffer;
    try {
      firmaRecibida = Buffer.from(firmaBase64, "base64");
    } catch {
      continue;
    }
    if (firmaRecibida.length !== firmaEsperada.length) continue;
    if (timingSafeEqual(firmaRecibida, firmaEsperada)) {
      return { valido: true };
    }
  }

  return { valido: false, motivo: "La firma no coincide con ninguna de las recibidas." };
}
