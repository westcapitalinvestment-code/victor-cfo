// Catálogo y utilidades compartidas de "Oficinas de contables" (migración
// 0163, 18 oct 2026). Lo usan el portal del vendedor, el portal del contable
// y el directorio de clientes — sin imports de servidor para poder usarlo en
// componentes cliente.

export const MUNICIPIOS_PR = [
  "Adjuntas", "Aguada", "Aguadilla", "Aguas Buenas", "Aibonito", "Añasco", "Arecibo", "Arroyo", "Barceloneta",
  "Barranquitas", "Bayamón", "Cabo Rojo", "Caguas", "Camuy", "Canóvanas", "Carolina", "Cataño", "Cayey", "Ceiba",
  "Ciales", "Cidra", "Coamo", "Comerío", "Corozal", "Culebra", "Dorado", "Fajardo", "Florida", "Guánica", "Guayama",
  "Guayanilla", "Guaynabo", "Gurabo", "Hatillo", "Hormigueros", "Humacao", "Isabela", "Jayuya", "Juana Díaz", "Juncos",
  "Lajas", "Lares", "Las Marías", "Las Piedras", "Loíza", "Luquillo", "Manatí", "Maricao", "Maunabo", "Mayagüez", "Moca",
  "Morovis", "Naguabo", "Naranjito", "Orocovis", "Patillas", "Peñuelas", "Ponce", "Quebradillas", "Rincón", "Río Grande",
  "Sabana Grande", "Salinas", "San Germán", "San Juan", "San Lorenzo", "San Sebastián", "Santa Isabel", "Toa Alta",
  "Toa Baja", "Trujillo Alto", "Utuado", "Vega Alta", "Vega Baja", "Vieques", "Villalba", "Yabucoa", "Yauco",
] as const;

export const SECTORES = [
  "Restaurantes y food trucks",
  "Salud y consultorios médicos",
  "Construcción y contratistas",
  "Comercio al detal / tiendas",
  "Tiendas en línea (e-commerce)",
  "Servicios profesionales",
  "Servicios de mantenimiento y técnicos",
  "Transportación y logística",
  "Bienes raíces",
  "Agricultura",
  "Organizaciones sin fines de lucro",
  "Individuos y trabajadores por cuenta propia",
] as const;

export const ESPECIALIDADES = [
  "Planillas personales",
  "Planillas de corporaciones / LLC",
  "IVU y SURI",
  "Retenciones y Modelo 480",
  "Nómina",
  "Contabilidad mensual (bookkeeping)",
  "Auditoría y revisión",
  "Planificación contributiva",
  "Incorporación de negocios",
  "Estados financieros",
  "Representación ante Hacienda",
] as const;

export const ESTADOS_SEGUIMIENTO = ["pendiente", "visitado", "interesado", "demo_hecha", "rechazo"] as const;
export type EstadoSeguimiento = (typeof ESTADOS_SEGUIMIENTO)[number];

export const ESTADO_SEGUIMIENTO_LABEL: Record<EstadoSeguimiento, string> = {
  pendiente: "Pendiente",
  visitado: "Visitado",
  interesado: "Interesado",
  demo_hecha: "Demo hecha",
  rechazo: "Rechazó",
};

export const ESTADO_SEGUIMIENTO_COLOR: Record<EstadoSeguimiento, string> = {
  pendiente: "text-muted",
  visitado: "text-amb",
  interesado: "text-teal",
  demo_hecha: "text-teal",
  rechazo: "text-red",
};

export function esEstadoSeguimiento(v: unknown): v is EstadoSeguimiento {
  return typeof v === "string" && (ESTADOS_SEGUIMIENTO as readonly string[]).includes(v);
}

// Minúsculas, sin acentos ni símbolos: "Contabilidad  Díaz, CPA." -> "contabilidaddiazcpa"
export function normalizarNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Mismo criterio que public.normalizar_telefono(): 10 dígitos, sin el 1 inicial.
export function normalizarTelefono(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

export function limpiarLista(raw: unknown, permitidos: readonly string[]): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((x): x is string => typeof x === "string" && permitidos.includes(x))));
}

// Como limpiarLista, pero además deja que el contable escriba sus propias
// etiquetas (ej. "Agrícola", "Farmacias", "Decretos", "Corp. sin fines de
// lucro"): las de la lista pasan tal cual; las libres se limpian (2–40
// caracteres, sin < > ni saltos de línea) y se limitan a 8 por lista.
export function limpiarListaLibre(raw: unknown, permitidos: readonly string[], maxLibres = 8): string[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  const out: string[] = [];
  let libres = 0;
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const esPermitida = permitidos.includes(x);
    const v = esPermitida ? x : x.replace(/[<>\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
    if (v.length < 2) continue;
    const k = v.toLowerCase();
    if (vistos.has(k)) continue;
    if (!esPermitida) {
      if (libres >= maxLibres) continue;
      libres++;
    }
    vistos.add(k);
    out.push(v);
  }
  return out;
}

// Acepta "@usuario", "usuario" o una URL completa y devuelve la URL.
export function urlSocial(tipo: "web" | "instagram" | "facebook", valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (tipo === "web") return `https://${v.replace(/^\/+/, "")}`;
  const handle = v.replace(/^@/, "").replace(/^\/+/, "");
  if (/\.[a-z]{2,}\//i.test(handle) || /^(www\.)?(instagram|facebook|fb)\.com/i.test(handle)) return `https://${handle}`;
  return tipo === "instagram" ? `https://instagram.com/${handle}` : `https://facebook.com/${handle}`;
}

// Valida un campo social/web: solo texto corto sin espacios (evita pegar basura).
export function limpiarSocial(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().slice(0, 200);
  if (!v || /\s/.test(v) || /^(javascript|data):/i.test(v)) return null;
  return v;
}

export const DIAS_PROTECCION_OFICINA = 60;

export type StatusOficina = "tiene_portal" | "en_seguimiento" | "disponible";

export const STATUS_OFICINA_LABEL: Record<StatusOficina, string> = {
  tiene_portal: "Tiene el portal",
  en_seguimiento: "Ya visitada · en seguimiento",
  disponible: "Disponible (seguimiento vencido)",
};

// Una ficha está "completa" (sale en el directorio) si el contable la dejó lista.
export function perfilCompleto(o: {
  pueblo: string | null;
  especialidades: string[] | null;
  descripcion: string | null;
}): boolean {
  return !!o.pueblo && (o.especialidades?.length ?? 0) > 0 && (o.descripcion?.trim().length ?? 0) >= 20;
}
