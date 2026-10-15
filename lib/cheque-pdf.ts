import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { promises as fs } from "fs";
import path from "path";

// Cheques impresos desde Pagos (15 oct 2026). Una hoja Carta por cheque con el
// formato "cheque arriba" de los talonarios de QuickBooks: cheque en el tercio
// superior y dos talones (control y copia del beneficiario) debajo.
//
// Dos modos de papel:
//  - "preimpreso": el banco ya trae nombre, cuenta y MICR → solo se imprime
//    fecha, beneficiario, monto, monto en letras y memo (y los talones).
//  - "blanco": papel en blanco con tóner MICR → además se imprime el
//    encabezado de la empresa y, si micr=true, la línea MICR.
// La línea MICR solo es legible por el banco si se imprime con tóner MICR y
// fuente E-13B. Si existe public/fonts/GnuMICR.ttf se usa (transit=A, on-us=C,
// guion=D, monto=B, convención de GnuMICR); si no, sale en Courier y es solo
// de referencia visual.

export type EntidadCheque = {
  nombre: string;
  direccion?: string | null;
  banco?: string | null;
  routing?: string | null;
  cuenta?: string | null;
  modo: "preimpreso" | "blanco";
  imprimirMicr: boolean;
};

export type ChequeDatos = {
  numero: number;
  fecha: string; // YYYY-MM-DD
  beneficiario: string;
  monto: number;
  memo?: string | null;
  bruto: number;
  retencion: number;
  retencionPct: number;
  periodo?: string | null;
};

const UNIDADES = [
  "", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece",
  "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós",
  "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos",
  "ochocientos", "novecientos",
];

function menorMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (r > 0) {
    if (r < 30) partes.push(UNIDADES[r]);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      partes.push(u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`);
    }
  }
  return partes.join(" ");
}

function enteroALetras(n: number): string {
  if (n === 0) return "cero";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones > 0) partes.push(millones === 1 ? "un millón" : `${enteroALetras(millones)} millones`);
  if (miles > 0) partes.push(miles === 1 ? "mil" : `${menorMil(miles).replace(/uno$/, "un")} mil`);
  if (resto > 0) partes.push(menorMil(resto));
  return partes.join(" ");
}

export function montoEnLetras(monto: number): string {
  const centavosTotal = Math.round(monto * 100);
  const dolares = Math.floor(centavosTotal / 100);
  const centavos = centavosTotal % 100;
  const letras = enteroALetras(dolares)
    .replace(/veintiuno$/, "veintiún")
    .replace(/uno$/, "un")
    .replace(/veintiuno mil/g, "veintiún mil")
    .toUpperCase();
  return `${letras} CON ${String(centavos).padStart(2, "0")}/100 DÓLARES`;
}

function dinero(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fechaMDY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// WinAnsi (fuentes estándar de pdf-lib) no admite todos los caracteres.
function seguro(s: string): string {
  return s.replace(/[^ -~ -ÿ]/g, "?");
}

async function cargarFuenteMicr(pdf: PDFDocument): Promise<PDFFont | null> {
  try {
    const ruta = path.join(process.cwd(), "public", "fonts", "GnuMICR.ttf");
    const bytes = await fs.readFile(ruta);
    // Dependencia opcional (npm i @pdf-lib/fontkit): el nombre va en una variable
    // para que el bundler no falle si no está instalada.
    const modName = "@pdf-lib/fontkit";
    const fontkit = (await import(/* webpackIgnore: true */ modName)).default;
    pdf.registerFontkit(fontkit);
    return await pdf.embedFont(bytes);
  } catch {
    return null;
  }
}

export async function generarChequesPDF(entidad: EntidadCheque, cheques: ChequeDatos[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const courier = await pdf.embedFont(StandardFonts.CourierBold);
  const micrFont = entidad.modo === "blanco" && entidad.imprimirMicr ? await cargarFuenteMicr(pdf) : null;

  const W = 612;
  const H = 792;
  const negro = rgb(0, 0, 0);
  const gris = rgb(0.4, 0.4, 0.4);

  const txt = (page: PDFPage, s: string, x: number, yTop: number, size: number, font: PDFFont = normal, color = negro) =>
    page.drawText(seguro(s), { x, y: H - yTop, size, font, color });

  for (const c of cheques) {
    const page = pdf.addPage([W, H]);
    const blanco = entidad.modo === "blanco";

    // ---- Cheque (tercio superior) ----
    if (blanco) {
      txt(page, entidad.nombre, 40, 48, 12, negrita);
      if (entidad.direccion) {
        entidad.direccion
          .split(/\r?\n/)
          .slice(0, 3)
          .forEach((l, i) => txt(page, l.trim(), 40, 62 + i * 11, 9, normal, gris));
      }
      if (entidad.banco) txt(page, entidad.banco, 330, 48, 9, normal, gris);
      txt(page, String(c.numero), 520, 48, 12, negrita);
      txt(page, "PÁGUESE A", 40, 112, 7, normal, gris);
      txt(page, "LA ORDEN DE", 40, 120, 7, normal, gris);
      page.drawLine({ start: { x: 85, y: H - 124 }, end: { x: 410, y: H - 124 }, thickness: 0.6, color: gris });
      page.drawRectangle({ x: 440, y: H - 128, width: 130, height: 22, borderWidth: 0.8, borderColor: negro });
      page.drawLine({ start: { x: 40, y: H - 160 }, end: { x: 430, y: H - 160 }, thickness: 0.6, color: gris });
      txt(page, "DÓLARES", 436, 156, 8, normal, gris);
      txt(page, "FECHA", 440, 84, 7, normal, gris);
      txt(page, "MEMO", 40, 205, 7, normal, gris);
      page.drawLine({ start: { x: 70, y: H - 209 }, end: { x: 280, y: H - 209 }, thickness: 0.6, color: gris });
      page.drawLine({ start: { x: 380, y: H - 209 }, end: { x: 572, y: H - 209 }, thickness: 0.6, color: gris });
    }

    txt(page, fechaMDY(c.fecha), 470, 96, 10.5);
    txt(page, c.beneficiario, 92, 120, 11, negrita);
    txt(page, `**${dinero(c.monto)}`, 450, 121, 11.5, negrita);
    txt(page, `${montoEnLetras(c.monto)} ${"*".repeat(4)}`, 44, 156, 9.5);
    if (c.memo) txt(page, c.memo.slice(0, 48), 74, 204, 9);

    if (blanco && entidad.imprimirMicr && entidad.routing && entidad.cuenta) {
      const num = String(c.numero).padStart(6, "0");
      if (micrFont) {
        // Convención GnuMICR: A = tránsito, C = on-us, D = guion.
        txt(page, `C${num}C A${entidad.routing}A ${entidad.cuenta}C`, 60, 238, 15, micrFont);
      } else {
        txt(page, `C${num}C A${entidad.routing}A ${entidad.cuenta}C`, 60, 238, 12, courier, gris);
      }
    }

    // ---- Dos talones: control y copia ----
    for (let i = 0; i < 2; i++) {
      const top = 270 + i * 258;
      page.drawLine({ start: { x: 30, y: H - top + 10 }, end: { x: W - 30, y: H - top + 10 }, thickness: 0.5, color: gris, dashArray: [4, 3] });
      txt(page, entidad.nombre, 40, top + 14, 10, negrita);
      txt(page, i === 0 ? "TALÓN DE CONTROL" : "COPIA DEL BENEFICIARIO", 400, top + 14, 8, normal, gris);
      txt(page, `Cheque #${c.numero}`, 40, top + 34, 10, negrita);
      txt(page, `Fecha: ${fechaMDY(c.fecha)}`, 200, top + 34, 10);
      txt(page, `Beneficiario: ${c.beneficiario}`, 40, top + 52, 10);
      if (c.periodo) txt(page, `Período: ${c.periodo}`, 40, top + 68, 9, normal, gris);

      const baseY = top + 92;
      const fila = (etq: string, val: string, n: number, bold = false) => {
        txt(page, etq, 40, baseY + n * 16, 10, bold ? negrita : normal);
        const w = (bold ? negrita : normal).widthOfTextAtSize(val, 10);
        txt(page, val, 250 - w, baseY + n * 16, 10, bold ? negrita : normal);
      };
      fila("Monto bruto", `$${dinero(c.bruto)}`, 0);
      fila(`Retención (${c.retencionPct}%)`, `-$${dinero(c.retencion)}`, 1);
      page.drawLine({ start: { x: 40, y: H - (baseY + 16 * 2 - 14) }, end: { x: 250, y: H - (baseY + 16 * 2 - 14) }, thickness: 0.5, color: gris });
      fila("Neto pagado", `$${dinero(c.monto)}`, 2, true);
      if (c.memo) txt(page, `Memo: ${c.memo.slice(0, 70)}`, 40, baseY + 16 * 3 + 6, 9, normal, gris);
    }
  }

  return pdf.save();
}
