// Meta Pixel (16 sept 2026, pedido de Joel: arrancar ads pagados en Meta/
// Instagram para promoción amplia en PR). El Pixel ID viene de la cuenta de
// Business Suite que Joel creó ese mismo día ("VICTOR CFO Pixel").
//
// El script base (ver app/layout.tsx) dispara PageView automático en cada
// carga de página — de ahí en adelante, estas funciones son solo wrappers
// seguros para disparar eventos estándar de Meta desde componentes cliente
// puntuales (registro, onboarding), sin repetir el chequeo de
// "¿existe window.fbq?" en cada sitio.
export const META_PIXEL_ID = "1107383785154187";

type FbqEventoEstandar =
  | "Lead"
  | "CompleteRegistration"
  | "StartTrial"
  | "Purchase"
  | "InitiateCheckout";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// Guardado silencioso: si el script del Pixel no cargó (ad blocker, error de
// red, etc.), esto no debe tumbar el flujo real de registro de nadie.
export function fbqTrack(evento: FbqEventoEstandar, params?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("track", evento, params);
    }
  } catch {
    // silencioso a propósito — nunca debe romper el flujo de registro/pago.
  }
}
