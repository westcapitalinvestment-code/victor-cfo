// Etiquetas legibles de plan — compartidas entre el Dashboard de
// Operaciones (app/dashboard/cfo/page.tsx) y su panel de usuarios
// (app/dashboard/cfo/usuarios-panel.tsx), 3 sept 2026, para que ambos
// muestren "Gratis" en vez del valor crudo "gratis" que guarda la columna
// users.plan (el sistema de referidos, migración 0031, introdujo ese
// tercer valor de plan además de core/pro/proplus).
export const PLAN_LABEL: Record<string, string> = { core: "Core", pro: "Pro", proplus: "Pro+", gratis: "Gratis" };
