// Evaluador de incentivos de Puerto Rico (15 nov 2026). Puro, sin Supabase:
// recibe el perfil del negocio y el catálogo (tabla incentivos_pr, migración
// 0210) y devuelve, para cada incentivo, si el negocio PODRÍA cualificar.
// Regla de VICTOR: el backend calcula y Claude comunica. Nunca se dice
// "cualificas": la decisión es del DDEC.

export const INDUSTRIAS: { id: string; nombre: string }[] = [
  { id: "software", nombre: "Software, apps o plataformas digitales (SaaS)" },
  { id: "manufactura", nombre: "Manufactura" },
  { id: "turismo", nombre: "Turismo u hospedería" },
  { id: "agricultura", nombre: "Agricultura (agricultor bona fide)" },
  { id: "agroindustria", nombre: "Agroindustria / procesamiento de alimentos" },
  { id: "creativas", nombre: "Industrias creativas (cine, música, diseño…)" },
  { id: "energia", nombre: "Energía verde / ambiental" },
  { id: "servicios_profesionales", nombre: "Servicios profesionales" },
  { id: "salud", nombre: "Salud / servicios médicos" },
  { id: "comercio", nombre: "Comercio / tienda" },
  { id: "restaurante", nombre: "Restaurante / comida" },
  { id: "construccion", nombre: "Construcción" },
  { id: "transporte", nombre: "Transporte" },
  { id: "otro", nombre: "Otro" },
];
export const nombreIndustria = (id: string | null) => INDUSTRIAS.find((i) => i.id === id)?.nombre ?? null;

// Industrias con un capítulo de decreto propio en la Ley 60. Además, cualquier
// negocio con clientes fuera de PR puede ser elegible por exportación (Cap. 3).
const INDUSTRIAS_DECRETO = ["software", "manufactura", "turismo", "agricultura", "agroindustria", "creativas", "energia"];

export type PerfilIncentivos = {
  industria: string | null;
  fechaInicio: string | null; // yyyy-mm-dd
  clientesFueraPR: boolean | null;
  tieneVentas: boolean; // alguna venta/ingreso registrado alguna vez
  ventas12m: number; // ingresos de los últimos 12 meses
  ganancia12m: number; // ingresos - gastos de los últimos 12 meses
  empleados: number; // empleados activos en Nómina
  edadDueno: number | null;
  residentePR: boolean;
  tieneDecreto: boolean;
};

export type Regla =
  | { t: "industria"; en: string[] }
  | { t: "elegible_decreto" }
  | { t: "no_elegible_decreto" }
  | { t: "ventas_max"; v: number }
  | { t: "empleados_max"; v: number }
  | { t: "empleados_min"; v: number }
  | { t: "edad_entre"; min: number; max: number }
  | { t: "inicio_desde"; v: string }
  | { t: "sin_ventas" }
  | { t: "residente_pr" }
  | { t: "clientes_fuera_pr" }
  | { t: "tiene_decreto" };

export type Incentivo = {
  id: string;
  nombre: string;
  tipo: "decreto" | "programa" | "credito";
  referencia_legal: string | null;
  resumen: string;
  beneficios: string;
  requisitos_texto: string;
  reglas: Regla[];
  tasa_decreto: number | null;
  monto_max: number | null;
  urgente: string | null;
  excluye: string | null;
  como_solicitar: string | null;
  enlace: string | null;
  fuente: string | null;
  verificado_en: string | null;
  orden: number;
};

export type DatoFaltante = "industria" | "fecha_inicio" | "clientes_fuera_pr" | "edad";
export type Condicion = { estado: "si" | "no" | "falta"; texto: string; falta?: DatoFaltante };
export type Evaluacion = {
  incentivo: Incentivo;
  estado: "cumple" | "falta_dato" | "no_aplica";
  condiciones: Condicion[];
  faltan: DatoFaltante[];
  estimado: string | null; // texto corto con el número calculado
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function elegibleDecreto(p: PerfilIncentivos): boolean | null {
  if (p.industria && INDUSTRIAS_DECRETO.includes(p.industria)) return true;
  if (p.clientesFueraPR === true) return true;
  if (p.industria === null || p.clientesFueraPR === null) return null;
  return false;
}

function evaluarRegla(r: Regla, p: PerfilIncentivos): Condicion {
  switch (r.t) {
    case "industria": {
      const nombres = r.en.map((i) => nombreIndustria(i) ?? i).join(", ");
      if (!p.industria) return { estado: "falta", texto: `Actividad: ${nombres}`, falta: "industria" };
      return { estado: r.en.includes(p.industria) ? "si" : "no", texto: `Actividad: ${nombres}` };
    }
    case "elegible_decreto": {
      const e = elegibleDecreto(p);
      const texto = "Actividad elegible a decreto (Ley 60) o clientes fuera de PR";
      if (e === null) return { estado: "falta", texto, falta: p.industria === null ? "industria" : "clientes_fuera_pr" };
      return { estado: e ? "si" : "no", texto };
    }
    case "no_elegible_decreto": {
      const e = elegibleDecreto(p);
      const texto = "Negocio local que no es elegible a decreto";
      if (e === null) return { estado: "falta", texto, falta: p.industria === null ? "industria" : "clientes_fuera_pr" };
      return { estado: e ? "no" : "si", texto };
    }
    case "ventas_max":
      return { estado: p.ventas12m <= r.v ? "si" : "no", texto: `Ventas de ${usd(r.v)} o menos (las tuyas: ${usd(p.ventas12m)} en 12 meses)` };
    case "empleados_max":
      return { estado: p.empleados <= r.v ? "si" : "no", texto: `${r.v} empleados o menos (tienes ${p.empleados} en Nómina)` };
    case "empleados_min":
      return { estado: p.empleados >= r.v ? "si" : "no", texto: `Tener empleados en Nómina (tienes ${p.empleados})` };
    case "edad_entre": {
      const texto = `Dueño de ${r.min} a ${r.max} años`;
      if (p.edadDueno === null) return { estado: "falta", texto, falta: "edad" };
      return { estado: p.edadDueno >= r.min && p.edadDueno <= r.max ? "si" : "no", texto: `${texto} (tienes ${p.edadDueno})` };
    }
    case "inicio_desde": {
      const texto = "Negocio que comenzó después de la Ley 60 (1 julio 2019)";
      if (!p.fechaInicio) return { estado: "falta", texto, falta: "fecha_inicio" };
      return { estado: p.fechaInicio >= r.v ? "si" : "no", texto };
    }
    case "sin_ventas":
      return { estado: p.tieneVentas ? "no" : "si", texto: p.tieneVentas ? "Todavía sin ventas (ya hay ventas registradas)" : "Todavía sin ventas" };
    case "residente_pr":
      return { estado: p.residentePR ? "si" : "no", texto: "Residente de Puerto Rico" };
    case "clientes_fuera_pr": {
      const texto = "Clientes fuera de Puerto Rico";
      if (p.clientesFueraPR === null) return { estado: "falta", texto, falta: "clientes_fuera_pr" };
      return { estado: p.clientesFueraPR ? "si" : "no", texto };
    }
    case "tiene_decreto":
      return { estado: p.tieneDecreto ? "si" : "no", texto: "Tener ya un decreto" };
  }
}

function estimado(inc: Incentivo, p: PerfilIncentivos): string | null {
  if (inc.tasa_decreto !== null && p.ganancia12m > 0) {
    const gan = p.ganancia12m;
    if (inc.id === "joven_empresario") {
      return `Con tu ganancia de ${usd(gan)} en 12 meses, no pagarías contribución sobre ingresos (exención total hasta $500,000).`;
    }
    const imp = (gan * inc.tasa_decreto) / 100;
    return `Con tu ganancia de ${usd(gan)} en 12 meses, la contribución sería de ~${usd(imp)} (${inc.tasa_decreto}%). Sin decreto, la tasa normal puede llegar a 33% en individuos y 37.5% en corporaciones.`;
  }
  if (inc.monto_max) return `Hasta ${usd(inc.monto_max)}.`;
  return null;
}

export function evaluarIncentivos(catalogo: Incentivo[], p: PerfilIncentivos): Evaluacion[] {
  const salida = catalogo.map((inc) => {
    const condiciones = (inc.reglas ?? []).map((r) => evaluarRegla(r, p));
    const faltan = Array.from(new Set(condiciones.filter((c) => c.estado === "falta" && c.falta).map((c) => c.falta!)));
    const estadoGen: Evaluacion["estado"] = condiciones.some((c) => c.estado === "no")
      ? "no_aplica"
      : condiciones.some((c) => c.estado === "falta")
        ? "falta_dato"
        : "cumple";
    return { incentivo: inc, estado: estadoGen, condiciones, faltan, estimado: estadoGen === "no_aplica" ? null : estimado(inc, p) };
  });
  // Si cumple PYME Nueva, el decreto regular de la misma actividad queda como alternativa (no se oculta).
  const peso = { cumple: 0, falta_dato: 1, no_aplica: 2 } as const;
  return salida.sort((a, b) => peso[a.estado] - peso[b.estado] || a.incentivo.orden - b.incentivo.orden);
}

export const PREGUNTA_DATO: Record<DatoFaltante, string> = {
  industria: "¿A qué se dedica el negocio?",
  fecha_inicio: "¿Cuándo comenzó a operar?",
  clientes_fuera_pr: "¿Tiene clientes fuera de Puerto Rico?",
  edad: "¿Qué edad tiene el dueño?",
};
