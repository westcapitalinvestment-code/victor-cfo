import Anthropic from "@anthropic-ai/sdk";

// Avisos oficiales automáticos (30 oct 2026, pedido de Joel: "un bridge
// filtrado ... con el disclaimer que nosotros no hacemos ninguna información
// o carta, solo filtramos lo que los portales envían").
//
// Este módulo SOLO lee páginas públicas de fuentes oficiales, extrae los
// enlaces más recientes y le pide a un modelo pequeño que (1) decida si toca a
// lo que VICTOR cubre y (2) resuma lo que dice la fuente, sin consejos ni
// interpretación legal. El cron (/api/cron/avisos-oficiales) se encarga de
// guardar, deduplicar y notificar. Nada de esto pasa por un humano.

import { TEMAS_AVISOS, type TemaAviso } from "./avisos-comun";
export { DISCLAIMER_AVISOS, DISCLAIMER_AVISOS_CORTO, TEMAS_AVISOS, avisoAplicaA } from "./avisos-comun";
export type { TemaAviso, Segmentos } from "./avisos-comun";

export type Candidato = {
  url: string;
  titulo: string;
  fecha: string | null; // YYYY-MM-DD si la fuente la muestra
};

export type FuenteAviso = {
  id: "dtrh" | "hacienda" | "colegio_cpa_cartas" | "colegio_cpa_determinaciones" | "irs";
  nombre: string;
  listado: string; // página que se lee cada día
  extraer: (html: string) => Candidato[];
};

// --- utilidades de HTML (sin dependencias) ---------------------------------

const ENTIDADES_ES: Record<string, string> = {
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", uuml: "ü",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", iexcl: "¡", iquest: "¿",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", ndash: "–", mdash: "—", laquo: "«", raquo: "»",
};

function decodificar(t: string): string {
  return t
    .replace(/&([A-Za-z]+);/g, (m, n) => ENTIDADES_ES[n] ?? m)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function textoPlano(html: string): string {
  return decodificar(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

type Ancla = { href: string; texto: string; fin: number };
function anclas(html: string): Ancla[] {
  const resultado: Ancla[] = [];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    resultado.push({ href: decodificar(m[1]).trim(), texto: textoPlano(m[2]), fin: m.index + m[0].length });
  }
  return resultado;
}

function absoluta(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

const MESES_EN: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};

// --- extractores por fuente -------------------------------------------------

function extraerDTRH(html: string): Candidato[] {
  const base = "https://www.trabajo.pr.gov/";
  const salida: Candidato[] = [];
  for (const a of anclas(html)) {
    if (!a.href.includes("/docs/Prensa/")) continue;
    const url = absoluta(a.href, base);
    if (!url) continue;
    const fecha = a.texto.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    const titulo = a.texto.replace(/^\d{4}-\d{2}-\d{2}\s*/, "").trim();
    if (titulo.length < 15) continue;
    salida.push({ url, titulo, fecha });
  }
  return salida.slice(0, 8);
}

function extraerHacienda(html: string): Candidato[] {
  const base = "https://hacienda.pr.gov/";
  const salida: Candidato[] = [];
  for (const a of anclas(html)) {
    if (!/\/comunicados-de-prensa\/[^/?#]+/.test(a.href) || /ver más/i.test(a.texto)) continue;
    const url = absoluta(a.href, base);
    if (!url || a.texto.length < 15) continue;
    // La fecha ("Comunicado de Prensa 09/03/2026") viene justo después del título.
    const cola = textoPlano(html.slice(a.fin, a.fin + 700));
    const f = cola.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const fecha = f ? `${f[3]}-${f[1]}-${f[2]}` : null;
    if (!salida.some((s) => s.url === url)) salida.push({ url, titulo: a.texto, fecha });
  }
  return salida.slice(0, 8);
}

// Las páginas del Colegio de CPA reúnen las cartas circulares y determinaciones
// administrativas de Hacienda: cada <li> es "<a>Carta Circular Núm. X</a> / descripción".
function extraerColegio(html: string): Candidato[] {
  const salida: Candidato[] = [];
  for (const a of anclas(html)) {
    if (!/^https?:\/\/hacienda\.pr\.gov\/publicaciones\//.test(a.href)) continue;
    const resto = html.slice(a.fin, a.fin + 700).split(/<\/li>|<ul/i)[0];
    const desc = textoPlano(resto).replace(/^\/\s*/, "").trim();
    const titulo = desc ? `${a.texto} — ${desc}` : a.texto;
    if (!salida.some((s) => s.url === a.href)) salida.push({ url: a.href, titulo, fecha: null });
  }
  return salida.slice(0, 6);
}

const PAGINAS_IRS_IGNORAR = new Set([
  "news-releases-for-current-month", "tax-relief-in-disaster-situations", "topics-in-the-news", "fact-sheets",
  "irs-statements-and-announcements", "irs-tax-tips", "irs-guidance", "tax-articles-to-share", "posters-to-share",
  "working-families-tax-cuts", "news-release-and-fact-sheet-archive", "commissioners-comments-statements-and-remarks",
  "filing-season-statistics-by-year", "general-overview-of-taxpayer-reliance-on-guidance-published-in-the-internal-revenue-bulletin-and-faqs",
]);

function extraerIRS(html: string): Candidato[] {
  const base = "https://www.irs.gov/";
  const salida: Candidato[] = [];
  for (const a of anclas(html)) {
    const m = a.href.match(/^(?:https:\/\/www\.irs\.gov)?\/newsroom\/([a-z0-9-]+)$/);
    if (!m || PAGINAS_IRS_IGNORAR.has(m[1]) || a.texto.length < 30) continue;
    const url = absoluta(a.href, base);
    if (!url || salida.some((s) => s.url === url)) continue;
    const cola = textoPlano(html.slice(a.fin, a.fin + 600));
    const f = cola.match(/IR-\d{4}-\d+,\s*([A-Za-z]{3,5})\.?\s*(\d{1,2}),\s*(\d{4})/);
    const mes = f ? MESES_EN[f[1].toLowerCase()] : null;
    const fecha = f && mes ? `${f[3]}-${mes}-${f[2].padStart(2, "0")}` : null;
    // Solo comunicados con número IR- (descarta notas sin fecha como las de "Highlights" personales).
    if (!fecha) continue;
    salida.push({ url, titulo: a.texto, fecha });
  }
  return salida.slice(0, 8);
}

export const FUENTES: FuenteAviso[] = [
  { id: "dtrh", nombre: "Departamento del Trabajo y Recursos Humanos de PR", listado: "https://www.trabajo.pr.gov/", extraer: extraerDTRH },
  {
    id: "hacienda",
    nombre: "Departamento de Hacienda de PR",
    listado: "https://hacienda.pr.gov/sobre-hacienda/sala-de-prensa-virtual/comunicados-de-prensa",
    extraer: extraerHacienda,
  },
  {
    id: "colegio_cpa_cartas",
    nombre: "Colegio de CPA de PR (cartas circulares de Hacienda)",
    listado: "https://www.colegiocpa.com/legislacion/cartas-circulares/",
    extraer: extraerColegio,
  },
  {
    id: "colegio_cpa_determinaciones",
    nombre: "Colegio de CPA de PR (determinaciones administrativas de Hacienda)",
    listado: "https://www.colegiocpa.com/legislacion/determinaciones-administrativas/",
    extraer: extraerColegio,
  },
  { id: "irs", nombre: "IRS (Servicio de Rentas Internas federal)", listado: "https://www.irs.gov/newsroom", extraer: extraerIRS },
];

// --- descarga ---------------------------------------------------------------

const UA = "Mozilla/5.0 (compatible; VICTORCFO-Avisos/1.0; +https://www.victorcfo.com)";

export async function descargarTexto(url: string, ms = 20000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" }, redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

// --- filtro y resumen con IA ------------------------------------------------

export type ResultadoIA = {
  relevante: boolean;
  temas: TemaAviso[];
  urgencia: "baja" | "media" | "alta";
  titulo: string;
  resumen: string;
  fecha_limite: string | null;
};

const SYSTEM_IA = `Eres un filtro de avisos oficiales para VICTOR CFO, una app de finanzas para personas y pequeños negocios en Puerto Rico (facturación, IVU, nómina, pagos a contratistas, contribución estimada) y su portal para contadores (CPA).

Recibes UN comunicado o página publicada por una fuente oficial. Decide si es RELEVANTE y resúmelo.

RELEVANTE solo si afecta a: patronos y nómina (planillas trimestrales, desempleo, incapacidad, seguro choferil, retenciones, bono de Navidad, salario mínimo), pagos a contratistas (480.6SP, 1099), IVU o impuesto sobre ventas, contribución estimada, fechas límite o formularios de planillas (individuos, corporaciones, entidades conducto), prórrogas, límites de planes de retiro, cambios en sistemas de radicación (SURI, Desempleo Digital), la práctica de contabilidad/CPA, o cambios del IRS que afecten a pequeños negocios, autónomos o patronos.
NO relevante: ferias de empleo, estadísticas de empleo o recaudos, convocatorias de compras o de empleo, noticias institucionales, eventos, donaciones, fraude ajeno, créditos solo para seniors/pensionados, temas fuera de lo anterior.

REGLAS ESTRICTAS:
- Resume SOLO lo que dice la fuente. No agregues consejos, no interpretes la ley, no digas "debes". Usa tono neutral ("El Departamento extendió…").
- No inventes fechas ni cifras. Si la fecha límite no aparece de forma explícita, usa null.
- Todo en español (traduce si la fuente está en inglés).
- "temas": elige entre ${TEMAS_AVISOS.join(", ")}.
- "urgencia": "alta" si hay una fecha límite en los próximos 21 días o un cambio inmediato; "media" si hay fecha o cambio relevante más adelante; "baja" si es informativo.

Responde SOLO con un objeto JSON, sin texto extra:
{"relevante":boolean,"temas":[...],"urgencia":"baja|media|alta","titulo":"máx 90 caracteres","resumen":"máx 300 caracteres","fecha_limite":"YYYY-MM-DD"|null}`;

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

export async function filtrarConIA(params: {
  fuenteNombre: string;
  candidato: Candidato;
  hoyISO: string;
}): Promise<ResultadoIA | null> {
  if (!anthropic) throw new Error("ANTHROPIC_API_KEY no está configurada.");
  const { fuenteNombre, candidato, hoyISO } = params;

  type Bloque =
    | { type: "text"; text: string }
    | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };
  const contenido: Bloque[] = [];
  const cabecera = `Fecha de hoy: ${hoyISO}\nFuente: ${fuenteNombre}\nTítulo: ${candidato.titulo}\nFecha de publicación: ${candidato.fecha ?? "no indicada"}\nEnlace: ${candidato.url}\n`;

  try {
    const esPdf = /\.pdf(\?|$)/i.test(candidato.url);
    if (esPdf) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      const r = await fetch(candidato.url, { signal: ctrl.signal, headers: { "user-agent": UA } }).finally(() => clearTimeout(t));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 4_500_000) throw new Error("PDF demasiado grande");
      contenido.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } });
      contenido.push({ type: "text", text: cabecera });
    } else {
      const html = await descargarTexto(candidato.url);
      contenido.push({ type: "text", text: `${cabecera}\nTexto de la página:\n${textoPlano(html).slice(0, 7000)}` });
    }
  } catch {
    // Si no se pudo leer el detalle, se decide solo con el título (más conservador).
    contenido.length = 0;
    contenido.push({ type: "text", text: `${cabecera}\n(No se pudo abrir el contenido completo; decide solo con el título y sé conservador con la fecha límite: usa null.)` });
  }

  const resp = await anthropic.messages.create({
    model: "claude-haiku-5-5",
    max_tokens: 600,
    system: SYSTEM_IA,
    messages: [{ role: "user", content: contenido }],
  });
  const bruto = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const json = bruto.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  const p = JSON.parse(json) as Partial<ResultadoIA>;

  const temas = (Array.isArray(p.temas) ? p.temas : []).filter((t): t is TemaAviso => (TEMAS_AVISOS as readonly string[]).includes(t as string));
  const urgencia = p.urgencia === "alta" || p.urgencia === "media" || p.urgencia === "baja" ? p.urgencia : "media";
  const fl = typeof p.fecha_limite === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha_limite) ? p.fecha_limite : null;
  const resumen = String(p.resumen ?? "").trim().slice(0, 400);
  const titulo = String(p.titulo ?? candidato.titulo).trim().slice(0, 140);
  if (!p.relevante || !resumen || temas.length === 0) return { relevante: false, temas, urgencia, titulo, resumen, fecha_limite: fl };
  return { relevante: true, temas, urgencia, titulo, resumen, fecha_limite: fl };
}
