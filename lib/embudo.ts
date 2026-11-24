// Embudo propio (23 nov 2026), sin Pixel: cuenta cuántos ven /trading, cuántos
// pulsan el botón, cuántos llegan al registro y cuántos lo completan, para saber
// dónde se va la gente. Solo guarda el nombre del paso, la ruta, utm_* y un id
// anónimo de navegador (nada personal).
const PERMITIDOS = [
  "vista_trading",
  "clic_cta_trading",
  "vista_registro_trading",
  "clic_google",
  "clic_email",
  "registro_email_ok",
  // 24 nov 2026: plan gratis sin registro (/trading/plan)
  "clic_plan",
  "vista_plan",
  "plan_listo",
  "lead_ok",
] as const;
export type EventoEmbudo = (typeof PERMITIDOS)[number];
export const EVENTOS_EMBUDO: readonly string[] = PERMITIDOS;

function sesion(): string {
  try {
    let id = localStorage.getItem("vc_sid");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("vc_sid", id);
    }
    return id;
  } catch {
    return "sin-storage";
  }
}

export function marcarEmbudo(evento: EventoEmbudo) {
  try {
    const q = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    q.forEach((v, k) => {
      if (k.startsWith("utm_")) utm[k] = v.slice(0, 100);
    });
    const body = JSON.stringify({ evento, ruta: window.location.pathname, sesion: sesion(), utm });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/embudo", new Blob([body], { type: "application/json" }));
    else fetch("/api/embudo", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    /* nunca romper la página por medir */
  }
}
