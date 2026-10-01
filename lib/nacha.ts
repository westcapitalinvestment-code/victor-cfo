// Generador de archivo NACHA (formato ACH estándar que aceptan BPPR,
// FirstBank y Oriental en su portal de "subir archivo ACH") — 30 sept 2026,
// segunda mitad de lo que pidió Joel a partir de su conversación con el CPA
// Custom Gem: "crear los 2, uno para los tecnologicos... y el NACHA para
// los que tiran ACH". Esto reemplaza copiar/pegar nombre+monto a mano en el
// portal del banco por subir un archivo .ach ya armado.
//
// Formato: registros de ancho fijo de 94 caracteres, agrupados en bloques de
// 10 (se rellena con registros "9" de relleno al final si hace falta).
// Referencia: NACHA Operating Rules — File Header (1), Batch Header (5),
// Entry Detail (6), Batch Control (8), File Control (9).
//
// Esto NO mueve dinero por sí solo — genera el archivo que Joel sube a mano
// al portal de su banco, que es quien de verdad ejecuta las transferencias.
// VICTOR CFO nunca ve ni toca fondos.

export interface OriginadorACH {
  nombreEmpresa: string; // máx 16 para Batch Header, máx 23 para File Header
  routingNumber: string; // 9 dígitos del banco originador
  companyId: string; // Company Identification que asigna el banco (a veces "1" + EIN)
  ein: string; // para el Immediate Origin del File Header si no hay companyId
}

export interface PagoACH {
  nombre: string; // nombre del contratista — máx 22
  routingNumber: string; // 9 dígitos
  accountNumber: string; // número de cuenta del contratista
  accountType: "checking" | "savings";
  montoCentavos: number; // entero, en centavos
  taxId?: string | null; // SSN/EIN, opcional — va en Individual Identification Number
}

function soloDigitos(s: string): string {
  return (s || "").replace(/\D/g, "");
}

function pad(s: string, largo: number, relleno = " ", derecha = true): string {
  const limpio = (s ?? "").toString().slice(0, largo);
  const faltan = largo - limpio.length;
  if (faltan <= 0) return limpio;
  return derecha ? limpio + relleno.repeat(faltan) : relleno.repeat(faltan) + limpio;
}

function padNum(n: number | string, largo: number): string {
  return pad(String(n), largo, "0", false);
}

function checkDigitRouting(routing9: string): string {
  // El 9no dígito de un routing number ya ES el check digit (algoritmo
  // mod-10 de la ABA) — no se recalcula, se usa tal cual viene.
  return routing9.slice(8, 9) || "0";
}

function fechaYYMMDD(d: Date): string {
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function horaHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface ResultadoNacha {
  contenido: string;
  totalCentavos: number;
  cantidadPagos: number;
  faltantes: string[]; // nombres de contratistas sin routing/cuenta completos — se excluyen del archivo
}

// Genera el contenido completo del archivo .ach — un solo batch (CCD,
// créditos solamente, Service Class Code 220) con un Entry Detail por pago.
export function generarArchivoNacha(
  originador: OriginadorACH,
  pagos: PagoACH[],
  fechaEfectiva: Date = new Date()
): ResultadoNacha {
  const routingOrigen = soloDigitos(originador.routingNumber).padEnd(9, "0").slice(0, 9);
  const odfi8 = routingOrigen.slice(0, 8);
  const companyId = pad(originador.companyId || `1${soloDigitos(originador.ein)}`, 10);

  const faltantes: string[] = [];
  const pagosValidos = pagos.filter((p) => {
    const ok = soloDigitos(p.routingNumber).length === 9 && soloDigitos(p.accountNumber).length > 0 && p.montoCentavos > 0;
    if (!ok) faltantes.push(p.nombre);
    return ok;
  });

  const lineas: string[] = [];

  // --- File Header (1) ---
  const inmediataDestino = ` ${routingOrigen}`; // mismo banco recibe y origina en este flujo simple
  const inmediataOrigen = ` ${routingOrigen}`;
  lineas.push(
    [
      "1",
      "01",
      pad(inmediataDestino, 10, " ", false),
      pad(inmediataOrigen, 10, " ", false),
      fechaYYMMDD(new Date()),
      horaHHMM(new Date()),
      "A",
      "094",
      "10",
      "1",
      pad(originador.nombreEmpresa, 23),
      pad(originador.nombreEmpresa, 23),
      pad("", 8),
    ].join("")
  );

  // --- Batch Header (5) ---
  const numeroBatch = "0000001";
  lineas.push(
    [
      "5",
      "220",
      pad(originador.nombreEmpresa, 16),
      pad("", 20),
      companyId,
      "CCD",
      pad("CONTRATIST", 10),
      pad("", 6),
      fechaYYMMDD(fechaEfectiva),
      "   ",
      "1",
      odfi8,
      numeroBatch,
    ].join("")
  );

  // --- Entry Detail (6) por pago ---
  let hashSuma = 0;
  let totalCentavos = 0;
  pagosValidos.forEach((p, idx) => {
    const routing9 = soloDigitos(p.routingNumber).padEnd(9, "0").slice(0, 9);
    const receivingDfi8 = routing9.slice(0, 8);
    const check = checkDigitRouting(routing9);
    hashSuma += Number(receivingDfi8);
    totalCentavos += p.montoCentavos;
    const codigoTransaccion = p.accountType === "savings" ? "32" : "22";
    const trace = `${odfi8}${padNum(idx + 1, 7)}`;
    lineas.push(
      [
        "6",
        codigoTransaccion,
        receivingDfi8,
        check,
        pad(soloDigitos(p.accountNumber), 17),
        padNum(p.montoCentavos, 10),
        pad(p.taxId ? soloDigitos(p.taxId) : "", 15),
        pad(p.nombre.toUpperCase(), 22),
        pad("", 2),
        "0",
        trace,
      ].join("")
    );
  });

  // --- Batch Control (8) ---
  const hash10 = String(hashSuma).slice(-10).padStart(10, "0");
  lineas.push(
    [
      "8",
      "220",
      padNum(pagosValidos.length, 6),
      hash10,
      padNum(0, 12), // sin débitos
      padNum(totalCentavos, 12),
      companyId,
      pad("", 19),
      pad("", 6),
      odfi8,
      numeroBatch,
    ].join("")
  );

  // --- File Control (9) ---
  const totalRegistrosSinRelleno = lineas.length + 1; // +1 por el propio File Control
  const bloques = Math.ceil(totalRegistrosSinRelleno / 10);
  lineas.push(
    [
      "9",
      padNum(1, 6), // 1 batch
      padNum(bloques, 6),
      padNum(pagosValidos.length, 8),
      hash10,
      padNum(0, 12),
      padNum(totalCentavos, 12),
      pad("", 39),
    ].join("")
  );

  // Relleno con registros "9" hasta completar el último bloque de 10.
  const totalConRelleno = bloques * 10;
  while (lineas.length < totalConRelleno) {
    lineas.push("9".repeat(94));
  }

  return {
    contenido: lineas.join("\r\n") + "\r\n",
    totalCentavos,
    cantidadPagos: pagosValidos.length,
    faltantes,
  };
}
