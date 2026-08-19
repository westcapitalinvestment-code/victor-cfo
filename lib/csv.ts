// Parser de CSV sin dependencias externas — suficiente para estados de
// cuenta de bancos/tarjetas y exportes de QuickBooks, que son CSV simples
// (a veces con campos entre comillas que contienen comas, ej. descripciones
// como "AMAZON.COM, INC."). No usamos una librería (papaparse, csv-parse)
// para no tener que tocar package.json y así Joel puede seguir pegando
// archivos sueltos en GitHub sin que Vercel necesite instalar nada nuevo.
//
// Soporta: comillas dobles con comas/saltos de línea adentro, comillas
// escapadas (""), separador , o ; (algunos bancos de PR exportan con ;),
// finales de línea \r\n o \n, y quita el BOM (﻿) que Excel a veces
// mete al principio del archivo.

export function parseCsv(texto: string): string[][] {
  let contenido = texto.replace(/^﻿/, "");
  // Detecta el separador con la primera línea no vacía — si hay más ";"
  // que "," fuera de comillas, asumimos ";" (común en exportes de banco
  // en formato europeo/latam). Heurística simple, no perfecta, pero cubre
  // el caso real sin pedirle al usuario que lo especifique.
  const primeraLinea = contenido.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const separador = (primeraLinea.match(/;/g)?.length ?? 0) > (primeraLinea.match(/,/g)?.length ?? 0) ? ";" : ",";

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let dentroDeComillas = false;
  let i = 0;

  while (i < contenido.length) {
    const c = contenido[i];

    if (dentroDeComillas) {
      if (c === '"') {
        if (contenido[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        dentroDeComillas = false;
        i++;
        continue;
      }
      campo += c;
      i++;
      continue;
    }

    if (c === '"') {
      dentroDeComillas = true;
      i++;
      continue;
    }
    if (c === separador) {
      fila.push(campo.trim());
      campo = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      fila.push(campo.trim());
      filas.push(fila);
      fila = [];
      campo = "";
      i++;
      continue;
    }
    campo += c;
    i++;
  }
  // Última fila/campo si el archivo no termina en salto de línea.
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo.trim());
    filas.push(fila);
  }

  // Descarta filas completamente vacías (líneas en blanco al final del
  // archivo, muy común en exportes de banco).
  return filas.filter((f) => f.some((v) => v.trim().length > 0));
}

// Convierte una fecha de texto en el formato que el usuario indicó a
// YYYY-MM-DD (lo que espera la columna `fecha` de transactions). Devuelve
// null si no pudo interpretarla, para que el caller decida cómo avisar.
export function normalizarFecha(valor: string, formato: "MDY" | "DMY" | "YMD"): string | null {
  const limpio = valor.trim();
  if (!limpio) return null;

  // Ya viene en ISO (YYYY-MM-DD) — pasa directo sin importar el formato
  // elegido, es el caso más común en exportes de QuickBooks.
  const isoDirecto = limpio.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoDirecto) {
    const [, y, m, d] = isoDirecto;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const partes = limpio.split(/[/\-.]/).map((p) => p.trim());
  if (partes.length !== 3) return null;
  const [a, b, c] = partes.map((p) => parseInt(p, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null;

  let año: number, mes: number, dia: number;
  if (formato === "MDY") {
    mes = a; dia = b; año = c;
  } else if (formato === "DMY") {
    dia = a; mes = b; año = c;
  } else {
    año = a; mes = b; dia = c;
  }
  if (año < 100) año += 2000; // "24" -> 2024
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  return `${año}`.padStart(4, "0") + "-" + `${mes}`.padStart(2, "0") + "-" + `${dia}`.padStart(2, "0");
}

// Convierte texto de monto ("$1,234.56", "(45.00)", "-45.00") a número.
// Los paréntesis son la convención contable típica para negativos
// (QuickBooks los usa seguido).
export function normalizarMonto(valor: string): number | null {
  let limpio = valor.trim();
  if (!limpio) return null;
  let negativo = false;
  if (limpio.startsWith("(") && limpio.endsWith(")")) {
    negativo = true;
    limpio = limpio.slice(1, -1);
  }
  limpio = limpio.replace(/[$,\s]/g, "");
  if (limpio.startsWith("-")) {
    negativo = true;
    limpio = limpio.slice(1);
  }
  const num = parseFloat(limpio);
  if (!Number.isFinite(num)) return null;
  return negativo ? -num : num;
}
