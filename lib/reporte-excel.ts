import ExcelJS from "exceljs";
import { descargarBytesR2 } from "@/lib/r2";

// Helper compartido para generar reportes .xlsx con la misma identidad
// visual del PDF de Facturación (app/api/facturas/reportes/pdf/route.ts):
// encabezado teal, totales en negrita, montos en formato moneda, y una
// línea de marca al final — para que cualquier CSV feo que se le mande a
// un cliente o CPA se vea igual de cuidado que el resto de la app (pedido
// de Joel, 5 sept 2026: "la app impecable y estos reportes horribles").
//
// El paquete "xlsx" (SheetJS) ya estaba instalado pero su edición gratuita
// no escribe estilos (fills/fonts/bordes) al generar un archivo — solo los
// lee. Por eso se añadió "exceljs", que sí soporta estilos completos y es
// gratuito.
//
// También sirve como vehículo de marca (pedido de Joel, mismo día): "ponle
// la marca de Victor para que el que vea el reporte bonito lo quiera" —
// por eso cada reporte lleva un pie de página con el nombre y el dominio.

const TEAL = "FF1D9E75";
const TEAL_OSCURO = "FF0F6B4E";
const GRIS_TEXTO = "FF6B7280";
const GRIS_CLARO = "FFF3F4F6";
const BLANCO = "FFFFFFFF";

// Lee el ancho/alto real de un PNG o JPEG desde sus bytes, para poder
// escalar el logo sin deformarlo — mismo problema que ya resolvía pdf-lib
// (pdf.embedPng/embedJpg trae width/height gratis) pero exceljs no lo da,
// solo dibuja la imagen en la caja que le pidas. Si el archivo viene raro
// o no se puede leer, cae en una caja 3:1 razonable para un logo apaisado.
function medidasImagen(buffer: Buffer, extension: "png" | "jpeg"): { width: number; height: number } {
  try {
    if (extension === "png") {
      // IHDR siempre empieza en el byte 16: 4 bytes width + 4 bytes height (big-endian).
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height };
    } else {
      // JPEG: recorrer los marcadores hasta dar con un SOFn (tamaño real de la imagen).
      let offset = 2; // salta 0xFFD8
      while (offset < buffer.length - 9) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marcador = buffer[offset + 1];
        const esSOF = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
        if (esSOF) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          if (width > 0 && height > 0) return { width, height };
        }
        const largoSegmento = buffer.readUInt16BE(offset + 2);
        offset += 2 + largoSegmento;
      }
    }
  } catch {
    // sigue al fallback de abajo
  }
  return { width: 300, height: 100 };
}

export interface ColumnaReporte {
  header: string;
  key: string;
  width?: number;
  moneda?: boolean;
  numero?: boolean;
  alinearDerecha?: boolean;
}

export interface FilaTotal {
  key: string;
  valor: string | number;
}

export interface ItemResumen {
  label: string;
  valor: string;
  /** ARGB, ej. TEAL_OSCURO. Por defecto usa el teal oscuro de marca. */
  colorHex?: string;
  fuerte?: boolean;
}

export interface LogoReporte {
  buffer: Buffer;
  extension: "png" | "jpeg";
}

export interface OpcionesReporteExcel {
  /** Nombre de la entidad de negocio o "VICTOR CFO" si es personal. */
  tituloEmpresa: string;
  /** Logo de la entidad (mismo logo_r2_key que usa el PDF de factura) — opcional. */
  logo?: LogoReporte;
  /** Ej. "Reporte de Gastos", "Reporte de Facturación — Por cliente". */
  tituloReporte: string;
  /** Ej. "01/01/2026 — 09/05/2026". */
  periodo?: string;
  /** Mini bloque de totales generales arriba de la tabla (Facturado/Cobrado, Ingresos/Gastos, etc.), igual que el "Resumen" del PDF. */
  resumen?: ItemResumen[];
  columnas: ColumnaReporte[];
  filas: Record<string, string | number | null | undefined>[];
  /** Fila de totales al final de la tabla, resaltada. */
  totales?: FilaTotal[];
  nombreHoja?: string;
}

// Descarga el logo de R2 y lo deja listo para generarReporteExcel — mismo
// logo_r2_key que ya usa el PDF de factura. Si no hay logo configurado o
// falla la descarga, devuelve undefined y el reporte sale sin logo (igual
// que la factura cuando el negocio no ha subido uno).
export async function cargarLogoExcel(logoR2Key: string | null | undefined): Promise<LogoReporte | undefined> {
  if (!logoR2Key) return undefined;
  try {
    const buffer = await descargarBytesR2(logoR2Key);
    const extension: "png" | "jpeg" = logoR2Key.toLowerCase().endsWith(".png") ? "png" : "jpeg";
    return { buffer, extension };
  } catch (err) {
    console.error("No se pudo cargar el logo para el reporte Excel:", err);
    return undefined;
  }
}

export async function generarReporteExcel(opts: OpcionesReporteExcel): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VICTOR CFO";
  workbook.created = new Date();

  const nombreHoja = (opts.nombreHoja ?? "Reporte").slice(0, 31);
  const sheet = workbook.addWorksheet(nombreHoja, {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const numCols = opts.columnas.length;

  sheet.columns = opts.columnas.map((c) => ({ key: c.key, width: c.width ?? 22 }));

  // --- Logo de la entidad (pedido de Joel, 5 sept 2026: "el logo de la
  // entidad también, como la factura") — ocupa la columna 1 en las
  // primeras filas; el texto de marca se corre a la columna 2 para no
  // encimarse quede el logo del tamaño que sea.
  const tieneLogo = !!opts.logo;
  const colInicioTexto = tieneLogo && numCols > 1 ? 2 : 1;
  if (opts.logo) {
    const { width: wOriginal, height: hOriginal } = medidasImagen(opts.logo.buffer, opts.logo.extension);
    const escala = Math.min(140 / wOriginal, 46 / hOriginal, 1);
    const imageId = workbook.addImage({ buffer: opts.logo.buffer as any, extension: opts.logo.extension });
    sheet.addImage(imageId, {
      tl: { col: 0.15, row: 0.15 },
      ext: { width: wOriginal * escala, height: hOriginal * escala },
    });
  }

  // --- Encabezado de marca ---
  if (numCols > colInicioTexto) sheet.mergeCells(1, colInicioTexto, 1, numCols);
  const filaEmpresa = sheet.getRow(1);
  filaEmpresa.getCell(colInicioTexto).value = opts.tituloEmpresa;
  filaEmpresa.getCell(colInicioTexto).font = { bold: true, size: 15, color: { argb: "FF16181D" } };
  filaEmpresa.height = 24;

  if (numCols > colInicioTexto) sheet.mergeCells(2, colInicioTexto, 2, numCols);
  const filaTitulo = sheet.getRow(2);
  filaTitulo.getCell(colInicioTexto).value = opts.tituloReporte;
  filaTitulo.getCell(colInicioTexto).font = { size: 11, color: { argb: GRIS_TEXTO } };

  let filaActual = 3;
  if (opts.periodo) {
    if (numCols > colInicioTexto) sheet.mergeCells(3, colInicioTexto, 3, numCols);
    const filaPeriodo = sheet.getRow(3);
    filaPeriodo.getCell(colInicioTexto).value = `Período: ${opts.periodo}`;
    filaPeriodo.getCell(colInicioTexto).font = { size: 9, italic: true, color: { argb: GRIS_TEXTO } };
    filaActual = 4;
  }

  // --- Mini resumen arriba de la tabla (Resumen del PDF, en Excel) ---
  if (opts.resumen && opts.resumen.length > 0) {
    filaActual += 1;
    for (const item of opts.resumen) {
      const r = sheet.getRow(filaActual);
      if (numCols > 1) sheet.mergeCells(filaActual, 1, filaActual, numCols - 1);
      r.getCell(1).value = item.label;
      r.getCell(1).font = { size: 10, bold: !!item.fuerte, color: { argb: "FF16181D" } };
      const valCell = r.getCell(numCols);
      valCell.value = item.valor;
      valCell.alignment = { horizontal: "right" };
      valCell.font = { size: 10, bold: true, color: { argb: item.colorHex ?? TEAL_OSCURO } };
      filaActual += 1;
    }
  }

  // Línea teal separadora, calcada del borde de sección del PDF.
  filaActual += 1;
  sheet.mergeCells(filaActual, 1, filaActual, numCols);
  sheet.getRow(filaActual).getCell(1).border = { bottom: { style: "medium", color: { argb: TEAL } } };
  filaActual += 1;

  // --- Encabezado de tabla ---
  const filaHeaderIdx = filaActual;
  const filaHeader = sheet.getRow(filaHeaderIdx);
  opts.columnas.forEach((c, i) => {
    const cell = filaHeader.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: BLANCO }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL_OSCURO } };
    cell.alignment = { vertical: "middle", horizontal: c.alinearDerecha ? "right" : "left" };
  });
  filaHeader.height = 20;
  sheet.views = [{ state: "frozen", ySplit: filaHeaderIdx, showGridLines: false }];

  // --- Filas de datos ---
  opts.filas.forEach((fila, idx) => {
    const r = sheet.getRow(filaHeaderIdx + 1 + idx);
    opts.columnas.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      const valor = fila[c.key];
      cell.value = c.moneda ? Number(valor ?? 0) : c.numero ? Number(valor ?? 0) : (valor ?? "");
      if (c.moneda) cell.numFmt = '"$"#,##0.00';
      cell.alignment = { horizontal: c.alinearDerecha || c.moneda || c.numero ? "right" : "left", vertical: "middle" };
      cell.font = { size: 10, color: { argb: "FF16181D" } };
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_CLARO } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE5E7EB" } } };
    });
  });

  let filaSiguiente = filaHeaderIdx + 1 + opts.filas.length;

  // --- Totales ---
  if (opts.totales && opts.totales.length > 0) {
    const r = sheet.getRow(filaSiguiente);
    opts.columnas.forEach((c, i) => {
      const total = opts.totales!.find((t) => t.key === c.key);
      const cell = r.getCell(i + 1);
      if (total) {
        cell.value = c.moneda ? Number(total.valor) : total.valor;
        if (c.moneda) cell.numFmt = '"$"#,##0.00';
      }
      cell.font = { bold: true, size: 10.5, color: { argb: TEAL_OSCURO } };
      cell.alignment = { horizontal: c.alinearDerecha || c.moneda ? "right" : "left" };
      cell.border = { top: { style: "medium", color: { argb: TEAL } } };
    });
    filaSiguiente += 1;
  }

  // --- Pie de marca (pedido de Joel: que cualquiera que vea el reporte
  // quiera VICTOR CFO también) ---
  filaSiguiente += 1;
  sheet.mergeCells(filaSiguiente, 1, filaSiguiente, numCols);
  const filaMarca = sheet.getRow(filaSiguiente);
  filaMarca.getCell(1).value = "Generado con VICTOR CFO  ·  victorcfo.com";
  filaMarca.getCell(1).font = { size: 8.5, italic: true, color: { argb: GRIS_TEXTO } };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
