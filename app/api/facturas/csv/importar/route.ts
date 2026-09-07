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
function parsePct(valor: string | undefined): number {
  if (!valor) return 0;
  const limpio = valor.replace(/%/g, "").trim();
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

const ESTADOS_VALIDOS = new Set(["pagada", "enviada", "borrador"]);

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

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const entityId: string | undefined = body?.entityId;
  const csv: string | undefined = body?.csv;
  const formatoFecha: "MDY" | "DMY" | "YMD" = body?.formatoFecha === "DMY" || body?.formatoFecha === "YMD" ? body.formatoFecha : "MDY";
  const estadoDefault: "pagada" | "enviada" = body?.estadoDefault === "enviada" ? "enviada" : "pagada";

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

  if (!entityId || !csv) {
    return NextResponse.json({ error: "Falta la entidad o el archivo." }, { status: 400 });
  }
  if (columnaCliente === undefined || columnaFecha === undefined || columnaSubtotal === undefined) {
    return NextResponse.json({ error: "Faltan columnas requeridas: Cliente, Fecha de emisión y Subtotal." }, { status: 400 });
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

  for (const fila of filasDatos) {
    const nombreCliente = (fila[columnaCliente] ?? "").trim();
    const fechaEmision = normalizarFecha(fila[columnaFecha] ?? "", formatoFecha);
    const subtotal = normalizarMonto(fila[columnaSubtotal] ?? "");

    if (!nombreCliente || !fechaEmision || subtotal === null || subtotal <= 0) {
      errores++;
      continue;
    }

    const nombreLower = nombreCliente.toLowerCase();
    let clientId = clientePorNombre.get(nombreLower);
    if (!clientId) {
      const { data: nuevoCliente, error: errCliente } = await supabase
        .from("clients")
        .insert({
          owner_id: user.id,
          entity_id: entityId,
          name: nombreCliente,
          es_negocio: false,
          retention_pct: 0,
        })
        .select("id")
        .single();
      if (errCliente || !nuevoCliente) {
        errores++;
        continue;
      }
      clientId = nuevoCliente.id;
      clientePorNombre.set(nombreLower, clientId);
      clientesCreados++;
    }

    let numero = columnaNumero !== null ? (fila[columnaNumero] ?? "").trim() : "";
    if (!numero) {
      numero = `IMP-${String(contadorAuto).padStart(4, "0")}`;
      contadorAuto++;
    }

    const claveDedup = `${clientId}::${numero.toLowerCase()}::${subtotal.toFixed(2)}`;
    if (clavesExistentes.has(claveDedup)) {
      duplicados++;
      continue;
    }
    clavesExistentes.add(claveDedup);

    const fechaVencimiento = columnaFechaVencimiento !== null ? normalizarFecha(fila[columnaFechaVencimiento] ?? "", formatoFecha) : null;
    const retencionPct = columnaRetencionPct !== null ? parsePct(fila[columnaRetencionPct]) : 0;
    const ivuPct = columnaIvuPct !== null ? parsePct(fila[columnaIvuPct]) : 0;
    const retencionMonto = Math.round(subtotal * (retencionPct / 100) * 100) / 100;
    const ivuMonto = Math.round(subtotal * (ivuPct / 100) * 100) / 100;
    const totalManual = columnaTotal !== null ? normalizarMonto(fila[columnaTotal] ?? "") : null;
    const total = totalManual !== null ? totalManual : Math.round((subtotal + ivuMonto - retencionMonto) * 100) / 100;

    const estado = normalizarEstado(columnaEstado !== null ? fila[columnaEstado] : undefined, estadoDefault);
    let fechaPago = columnaFechaPago !== null ? normalizarFecha(fila[columnaFechaPago] ?? "", formatoFecha) : null;
    // Si quedó marcada pagada pero el archivo no trae fecha de pago, se
    // usa la fecha de emisión como mejor estimado — mismo criterio que ya
    // usa el resto de la app para facturas pagadas sin fecha_pago (ver
    // migración 0046: "fecha_pago queda nula para facturas ya pagadas
    // antes de este campo existir").
    if (estado === "pagada" && !fechaPago) fechaPago = fechaEmision;

    const { data: facturaInsertada, error: errFactura } = await supabase
      .from("invoices")
      .insert({
        owner_id: user.id,
        entity_id: entityId,
        client_id: clientId,
        numero,
        subtotal,
        ivu_pct: ivuPct,
        ivu_monto: ivuMonto,
        retencion_pct: retencionPct,
        retencion_monto: retencionMonto,
        total,
        estado,
        fecha_emision: fechaEmision,
        fecha_vencimiento: fechaVencimiento,
        fecha_pago: fechaPago,
        notas: `Importada por CSV el ${hoyStr}.`,
        import_batch_id: importBatchId,
      })
      .select("id")
      .single();

    if (errFactura || !facturaInsertada) {
      errores++;
      continue;
    }

    await supabase.from("invoice_items").insert({
      invoice_id: facturaInsertada.id,
      descripcion: "Importado desde CSV",
      cantidad: 1,
      precio_unitario: subtotal,
      subtotal_linea: subtotal,
    });

    importados++;
  }

  return NextResponse.json({ importados, clientesCreados, duplicados, errores, importBatchId: importados > 0 ? importBatchId : null });
}
