// Regla 50/30/20 (22 oct 2026) — para el plan gratis. Cálculo puro (sin IA ni
// consultas): recibe los gastos del mes con el nombre de su categoría y los
// ingresos del mes, y los reparte en Necesidades (50%), Gustos (30%) y
// Ahorro y deudas (20%).
//
// Clasificación por nombre de categoría (las globales de la migración 0011).
// Lo que no se reconoce (categorías propias del usuario, "Otros gastos", sin
// categorizar) cae en Gustos y se informa aparte para que no sorprenda.

export type Grupo = "necesidades" | "gustos" | "ahorro";

const NECESIDADES = [
  "vivienda",
  "utilidades",
  "supermercado",
  "transporte",
  "salud",
  "seguros",
  "educacion",
];
const AHORRO = ["ahorro", "pagos de deudas"];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function grupoDeCategoria(nombre: string | null | undefined): { grupo: Grupo; reconocida: boolean } {
  const n = norm(nombre ?? "");
  if (!n) return { grupo: "gustos", reconocida: false };
  if (AHORRO.some((k) => n.includes(k))) return { grupo: "ahorro", reconocida: true };
  if (NECESIDADES.some((k) => n.startsWith(k))) return { grupo: "necesidades", reconocida: true };
  const gustos = ["restaurantes", "entretenimiento", "cuidado personal", "ropa", "mascotas", "regalos"];
  if (gustos.some((k) => n.startsWith(k))) return { grupo: "gustos", reconocida: true };
  return { grupo: "gustos", reconocida: false };
}

export type GastoCat = { categoria: string | null; monto: number };

export type FilaRegla = { grupo: Grupo; meta: number; monto: number; pct: number; estado: "bien" | "ajustar" };

export type ResultadoRegla = {
  ingresos: number;
  filas: FilaRegla[];
  sinClasificar: number; // monto en gustos que no se pudo clasificar
};

export const METAS: Record<Grupo, number> = { necesidades: 50, gustos: 30, ahorro: 20 };

export function calcularRegla503020(gastos: GastoCat[], ingresos: number): ResultadoRegla {
  const totales: Record<Grupo, number> = { necesidades: 0, gustos: 0, ahorro: 0 };
  let sinClasificar = 0;
  for (const g of gastos) {
    const { grupo, reconocida } = grupoDeCategoria(g.categoria);
    totales[grupo] += g.monto;
    if (!reconocida) sinClasificar += g.monto;
  }
  const filas: FilaRegla[] = (Object.keys(METAS) as Grupo[]).map((grupo) => {
    const monto = totales[grupo];
    const pct = ingresos > 0 ? Math.round((monto / ingresos) * 100) : 0;
    // Necesidades y gustos son TOPES (no pasarse); ahorro es un PISO (llegar).
    const estado = grupo === "ahorro" ? (pct >= METAS.ahorro ? "bien" : "ajustar") : pct <= METAS[grupo] ? "bien" : "ajustar";
    return { grupo, meta: METAS[grupo], monto, pct, estado };
  });
  return { ingresos, filas, sinClasificar };
}
