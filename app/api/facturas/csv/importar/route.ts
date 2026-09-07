import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { parseCsv, normalizarFecha, normalizarMonto } from "@/lib/csv";

// Importar facturas históricas desde CSV/Excel (7 sept 2026, pedido de
// Joel: "VICTOR me esta tirando numeros con lo que he procesado el 1 sept
// hasta hoy" — porque Facturación solo tenía las facturas creadas DENTRO
// de la app desde que empezó a usarla, nada de lo facturado antes en el
// año). Mismo patrón de 2 pasos que /api/clientes/csv/importar: el preview
// genérico (/api/cuentas-manuales/csv/preview) le enseña las columnas al
// frontend, y aquí, con el mapeo ya confirmado, se procesa el archivo
// completo — un insert de `invoices` + una línea en `invoice_items` por
// cada fila (para que el detalle de la factura no se vea vacío).
//
// A diferencia de clientes, el cliente de cada fila puede no existir
// todavía — en vez de rechazar la fila, se crea el cliente sobre la
// marcha (es_negocio:false, 0% retención, igual que si lo creara el
// usuario a mano) y se cuenta aparte en `clientesCreados`.
//
// modo "pagos_recibidos" (7 sept 2026, mismo día): el archivo real que
// Joel tenía no es "1 fila = 1 factura" — es el reporte "Payments
// Collected" de FreshBooks, que trae 1 o 2 filas POR PAGO de cada
// factura (una fila con el monto neto cobrado, y otra aparte con la
// retención, marcada en la columna Descripción como "Retención 6%").
// Con el modo estándar, cada fila se veía como una factura completa —
// entraba solo la mitad del monto real, o entraban 2 facturas falsas por
// cada una real. Este modo agrupa las filas por número de factura antes
// de crear nada.
function parsePct(valor: string | undefined): number {
  if (!valor) return 0;
  const limpio = valor.replace(/%/g, "").trim();
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

function normalizarEstado(valor: string | undefined, porDefecto: "pagada" | "enviada"): string {
  const limpio = (valor ?? "").trim().toLowerCase();
  if (!limpio) return porDefecto;
  if (["pagada", "paid", "cobrada", "completed", "closed", "pagado"].includes(limpio)) return "pagada";
  if (["enviada", "sent", "pending", "open", "unpaid", "due", "outstanding"].includes(limpio)) return "enviada";
  if (["borrador", "draft"].includes(limpio)) return "borrador";
  // Texto no reconocido (ej. "vencida"/"overdue" — ese estado se calcula
  // dinámicamente en la app a partir de fecha_vencimiento, nunca se guarda
  // literal) — cae al default que escogió el usuario en vez de fallar la
  // fila entera.
  return porDefecto;
}

// ¿Esta fila de pago es la retención (no el monto neto cobrado)? FreshBooks
// la marca en "Description" como "Retención 6%", "Withholding 10%", etc.
const RE_RETENCION = /retenci|withhold/i;
const RE_PCT = /([\d.]+)\s*%/;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const userId = user.id;

  const body = await req.json().catch(() => null);
  const entityId: string | undefined = body?.entityId;
  const csv: string | undefined = body?.csv;
  const formatoFecha: "MDY" | "DMY" | "YMD" = body?.formatoFecha === "DMY" || body?.formatoFecha === "YMD" ? body.formatoFecha : "MDY";
  const estadoDefault: "pagada" | "enviada" = body?.estadoDefault === "enviada" ? "enviada" : "pagada";
  const modo: "estandar" | "pagos_recibidos" = body?.modo === "pagos_recibidos" ? "pagos_recibidos" : "estandar";

  const columnaCliente: number | undefined = body?.columnaCliente;
  const columnaFecha: number | undefined = body?.columnaFecha;
  const columnaSubtotal: number | undefined = body?.columnaSubtotal;
  const columnaNumero: number | null = body?.columnaNumero ?? null;
  const columnaFechaVencimiento: number | null = body?.columnaFechaVencimiento ?? null;
  const columnaTotal: number | null = body?.columnaTotal ?? null;
  const columnaRetencionPct: number | null = body?.columnaRetencionPct ?? null;
  const columnaIvuPct: number | null = body?.columnaIvuPct ?? null;
  const columnaEstado: number | null = body?.columnaEstado ?? null;
  const columnaFechaPago: number | null = body?.columnaFechaPago ?? null;
  const columnaDescripcion: number | null = body?.columnaDescripcion ?? null;

  if (!entityId || !csv) {
    return NextResponse.json({ error: "Falta la entidad o el archivo." }, { status: 400 });
  }
  if (columnaCliente === undefined || columnaFecha === undefined || columnaSubtotal === undefined) {
    return NextResponse.json({ error: "Faltan columnas requeridas: Cliente, Fecha y Monto." }, { status: 400 });
  }
  if (modo === "pagos_recibidos" && columnaNumero === null) {
    return NextResponse.json({ error: "En modo 'Pagos recibidos' la columna Número de factura es requerida (para agrupar las filas)." }, { status: 400 });
  }

  const { data: entidad } = await supabase.from("business_entities").select("id").eq("id", entityId).eq("owner_id", user.id).maybeSingle();
  if (!entidad) return NextResponse.json({ error: "No se encontró esa entidad." }, { status: 404 });

  const filas = parseCsv(csv);
  const filasDatos = filas.slice(1);

  const { data: clientesExistentes } = await supabase.from("clients").select("id, name").eq("entity_id", entityId);
  const clientePorNombre = new Map((clientesExistentes ?? []).map((c) => [c.name.trim().toLowerCase(), c.id]));

  const { data: facturasExistentes } = await supabase.from("invoices").select("numero, client_id, subtotal").eq("entity_id", entityId);
  // La clave de dedup incluye el monto además de cliente+número: dos
  // facturas reales del mismo cliente pueden terminar con el mismo
  // "número" (auto-generado, o repetido en el archivo del usuario porque
  // ambas caen el mismo día) sin ser la misma factura. Antes esto hacía
  // que la 2da se descartara como "duplicado" y se perdiera un monto real
  // (bug reportado por Joel: Caribbean Health Solution $3,572.00 se comió
  // la de $228.00 del mismo día). Con el monto en la clave, solo se trata
  // como duplicado cuando cliente+número+monto coinciden exactamente —
  // que es el caso real de "subí el mismo archivo dos veces".
  const clavesExistentes = new Set(
    (facturasExistentes ?? []).map((f) => `${f.client_id}::${f.numero.trim().toLowerCase()}::${Number(f.subtotal).toFixed(2)}`)
  );

  // Números auto-generados para filas sin columna de número — sigue la
  // cuenta de facturas que ya tiene la entidad para no chocar con "F-0001"
  // que ya exista si el usuario ya había creado alguna a mano.
  let contadorAuto = (facturasExistentes ?? []).length + 1;

  // Cada corrida de importación se marca con un import_batch_id — así
  // Joel puede borrar de un solo golpe todo lo que trajo un CSV
  // equivocado sin tener que buscar factura por factura.
  const importBatchId = randomUUID();

  let importados = 0;
  let clientesCreados = 0;
  let duplicados = 0;
  let errores = 0;

  const hoyStr = new Date().toISOString().slice(0, 10);

  // Una sola factura ya resuelta (venga de una fila del modo estándar, o
  // de un grupo de filas del modo pagos_recibidos) — busca/crea el
  // cliente, aplica el dedup, inserta invoice + invoice_items.
  async function procesarFactura(f: {
    nombreCliente: string;
    fechaEmision: string;
    numero: string | null;
    subtotal: number;
    retencionPct: number;
    ivuPct: number;
    totalManual: number | null;
    estado: string;
    fechaVencimiento: string | null;
    fechaPago: string | null;
  }) {
    if (!f.nombreCliente || !f.fechaEmision || f.subtotal <= 0) {
      errores++;
      return;
    }

    const nombreLower = f.nombreCliente.toLowerCase();
    let clientId = clientePorNombre.get(nombreLower);
    if (!clientId) {
      const { data: nuevoCliente, error: errCliente } = await supabase
        .from("clients")
        .insert({ owner_id: userId, entity_id: entityId, name: f.nombreCliente, es_negocio: false, retention_pct: 0 })
        .select("id")
        .single();
      if (errCliente || !nuevoCliente) {
        errores++;
        return;
      }
      clientId = nuevoCliente.id;
      clientePorNombre.set(nombreLower, clientId);
      clientesCreados++;
    }

    let numero = f.numero ?? "";
    if (!numero) {
      numero = `IMP-${String(contadorAuto).padStart(4, "0")}`;
      contadorAuto++;
    }

    const claveDedup = `${clientId}::${numero.toLowerCase()}::${f.subtotal.toFixed(2)}`;
    if (clavesExistentes.has(claveDedup)) {
      duplicados++;
      return;
    }
    clavesExistentes.add(claveDedup);

    const retencionMonto = Math.round(f.subtotal * (f.retencionPct / 100) * 100) / 100;
    const ivuMonto = Math.round(f.subtotal * (f.ivuPct / 100) * 100) / 100;
    const total = f.totalManual !== null ? f.totalManual : Math.round((f.subtotal + ivuMonto - retencionMonto) * 100) / 100;

    let fechaPago = f.fechaPago;
    // Si quedó marcada pagada pero no trae fecha de pago, se usa la fecha
    // de emisión como mejor estimado — mismo criterio que ya usa el resto
    // de la app para facturas pagadas sin fecha_pago.
    if (f.estado === "pagada" && !fechaPago) fechaPago = f.fechaEmision;

    const { data: facturaInsertada, error: errFactura } = await supabase
      .from("invoices")
      .insert({
        owner_id: userId,
        entity_id: entityId,
        client_id: clientId,
        numero,
        subtotal: f.subtotal,
        ivu_pct: f.ivuPct,
        ivu_monto: ivuMonto,
        retencion_pct: f.retencionPct,
        retencion_monto: retencionMonto,
        total,
        estado: f.estado,
        fecha_emision: f.fechaEmision,
        fecha_vencimiento: f.fechaVencimiento,
        fecha_pago: fechaPago,
        notas: `Importada por CSV el ${hoyStr}.`,
        import_batch_id: importBatchId,
      })
      .select("id")
      .single();

    if (errFactura || !facturaInsertada) {
      errores++;
      return;
    }

    await supabase.from("invoice_items").insert({
      invoice_id: facturaInsertada.id,
      descripcion: "Importado desde CSV",
      cantidad: 1,
      precio_unitario: f.subtotal,
      subtotal_linea: f.subtotal,
    });

    importados++;
  }

  if (modo === "pagos_recibidos") {
    type FilaPago = { fecha: string; cliente: string; numero: string; monto: number; descripcion: string };
    const filasPago: FilaPago[] = [];
    for (const fila of filasDatos) {
      const cliente = (fila[columnaCliente] ?? "").trim();
      const fecha = normalizarFecha(fila[columnaFecha] ?? "", formatoFecha);
      const numero = (fila[columnaNumero as number] ?? "").trim();
      const monto = normalizarMonto(fila[columnaSubtotal] ?? "");
      const descripcion = columnaDescripcion !== null ? (fila[columnaDescripcion] ?? "").trim() : "";
      if (!cliente || !fecha || !numero || monto === null) {
        errores++;
        continue;
      }
      filasPago.push({ fecha, cliente, numero, monto, descripcion });
    }

    // Agrupa por número de factura — una factura de FreshBooks puede
    // traer 2 filas de pago (monto neto + retención) o varias (pagos
    // parciales), todas con el mismo Number.
    const grupos = new Map<string, FilaPago[]>();
    for (const fp of filasPago) {
      const key = fp.numero.toLowerCase();
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key)!.push(fp);
    }

    for (const filasGrupo of grupos.values()) {
      const filasRetencion = filasGrupo.filter((f) => RE_RETENCION.test(f.descripcion));
      const filasNeto = filasGrupo.filter((f) => !RE_RETENCION.test(f.descripcion));
      const retencionMonto = Math.round(filasRetencion.reduce((s, f) => s + f.monto, 0) * 100) / 100;
      const montoNeto = Math.round(filasNeto.reduce((s, f) => s + f.monto, 0) * 100) / 100;
      const subtotal = Math.round((montoNeto + retencionMonto) * 100) / 100;

      let retencionPct = 0;
      if (filasRetencion.length > 0) {
        const match = filasRetencion[0].descripcion.match(RE_PCT);
        retencionPct = match ? parseFloat(match[1]) : subtotal > 0 ? Math.round((retencionMonto / subtotal) * 10000) / 100 : 0;
      }

      const fechas = filasGrupo.map((f) => f.fecha).sort();

      await procesarFactura({
        nombreCliente: filasGrupo[0].cliente,
        fechaEmision: fechas[0],
        numero: filasGrupo[0].numero,
        subtotal,
        retencionPct,
        ivuPct: 0,
        totalManual: null,
        estado: "pagada",
        fechaVencimiento: null,
        fechaPago: fechas[fechas.length - 1],
      });
    }
  } else {
    for (const fila of filasDatos) {
      const nombreCliente = (fila[columnaCliente] ?? "").trim();
      const fechaEmision = normalizarFecha(fila[columnaFecha] ?? "", formatoFecha);
      const subtotal = normalizarMonto(fila[columnaSubtotal] ?? "");

      if (!nombreCliente || !fechaEmision || subtotal === null || subtotal <= 0) {
        errores++;
        continue;
      }

      const fechaVencimiento = columnaFechaVencimiento !== null ? normalizarFecha(fila[columnaFechaVencimiento] ?? "", formatoFecha) : null;
      const retencionPct = columnaRetencionPct !== null ? parsePct(fila[columnaRetencionPct]) : 0;
      const ivuPct = columnaIvuPct !== null ? parsePct(fila[columnaIvuPct]) : 0;
      const totalManual = columnaTotal !== null ? normalizarMonto(fila[columnaTotal] ?? "") : null;
      const estado = normalizarEstado(columnaEstado !== null ? fila[columnaEstado] : undefined, estadoDefault);
      const fechaPago = columnaFechaPago !== null ? normalizarFecha(fila[columnaFechaPago] ?? "", formatoFecha) : null;
      const numero = columnaNumero !== null ? (fila[columnaNumero] ?? "").trim() : "";

      await procesarFactura({
        nombreCliente,
        fechaEmision,
        numero: numero || null,
        subtotal,
        retencionPct,
        ivuPct,
        totalManual,
        estado,
        fechaVencimiento,
        fechaPago,
      });
    }
  }

  return NextResponse.json({ importados, clientesCreados, duplicados, errores, importBatchId: importados > 0 ? importBatchId : null });
}
