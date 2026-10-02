import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { generarReporteExcel, ColumnaReporte, FilaTotal } from "@/lib/reporte-excel";
import { slugificar } from "@/lib/format";

// Desglose por vendedor descargable — solo el founder (ver socios-panel.tsx,
// botón "Descargar Excel" dentro del desglose de un socio tipo='vendedor').
// A diferencia del portal del propio vendedor (/socios/portal), este SÍ
// incluye el ingreso mensual bruto que cada cliente le genera a WCV — es el
// reporte interno de Joel para comparar comisión pagada vs. ingreso, nunca
// se expone al vendedor.
//
// Mezcla filas del modelo viejo 70/30 (migración 0107, columna "comisión"
// = setenta+treinta) y del modelo nuevo de pago único (migración 0135, 2
// oct 2026, columna "comisión" = setenta_centavos solo, treinta siempre 0)
// — la columna "Comisión pagada" sirve para los dos; "Ingreso mensual WCV"
// usa monto_base_centavos para los 'unico' anuales porque ahí la comisión
// (20%) ya no es el ingreso real.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: socio } = await admin.from("socios").select("id, nombre, tipo").eq("id", params.id).maybeSingle();
  if (!socio || socio.tipo !== "vendedor") {
    return NextResponse.json({ error: "Socio no encontrado o no es vendedor." }, { status: 404 });
  }

  const { data: clientesEstado } = await admin
    .from("socios_vendedor_clientes")
    .select("referred_id, ciclo, modelo, primer_pago_at, setenta_centavos, treinta_centavos, treinta_estado, monto_base_centavos")
    .eq("socio_id", params.id);

  const referredIds = (clientesEstado ?? []).map((c) => c.referred_id);
  const { data: clientesUsers } = referredIds.length
    ? await admin.from("users").select("id, full_name, plan").in("id", referredIds)
    : { data: [] };
  const nombrePorId = new Map((clientesUsers ?? []).map((u) => [u.id, u.full_name]));

  const ESTADO_LABEL: Record<string, string> = {
    pendiente: "Generando comisión",
    liberada: "Ciclo completo — cobrado",
    perdida: "Cliente canceló — perdido",
  };

  const filas = (clientesEstado ?? []).map((c) => {
    const modelo = c.modelo ?? "setenta_treinta";
    const comision = (Number(c.setenta_centavos) + Number(c.treinta_centavos)) / 100;
    const montoReal = c.monto_base_centavos != null ? Number(c.monto_base_centavos) / 100 : null;
    // 'unico': ingreso real de WCV es el monto completo que pagó el
    // cliente (mensual equivalente si es anual) — NO la comisión, que bajo
    // este modelo es solo 20% en el caso anual. 'setenta_treinta': la
    // comisión total SIEMPRE fue igual al ingreso mensual equivalente.
    const ingresoWCV =
      modelo === "unico"
        ? c.ciclo === "anual"
          ? Math.round(((montoReal ?? comision) / 12) * 100) / 100
          : montoReal ?? comision
        : comision;
    return {
      cliente: nombrePorId.get(c.referred_id) ?? "Cliente",
      ciclo: c.ciclo,
      primerPago: c.primer_pago_at ? new Date(c.primer_pago_at).toLocaleDateString("es-PR") : "—",
      estado: ESTADO_LABEL[c.treinta_estado] ?? c.treinta_estado,
      comision,
      ingresoWCV,
    };
  });

  const columnas: ColumnaReporte[] = [
    { header: "Cliente", key: "cliente", width: 28 },
    { header: "Ciclo", key: "ciclo", width: 12 },
    { header: "1er pago real", key: "primerPago", width: 14 },
    { header: "Estado", key: "estado", width: 24 },
    { header: "Comisión pagada", key: "comision", width: 16, moneda: true },
    { header: "Ingreso mensual WCV", key: "ingresoWCV", width: 18, moneda: true },
  ];

  const totales: FilaTotal[] = [
    { key: "comision", valor: filas.reduce((s, f) => s + f.comision, 0) },
    { key: "ingresoWCV", valor: filas.reduce((s, f) => s + f.ingresoWCV, 0) },
  ];

  const buffer = await generarReporteExcel({
    tituloEmpresa: "VICTOR CFO — Dashboard de Operaciones",
    tituloReporte: `Desglose de vendedor — ${socio.nombre}`,
    columnas,
    filas,
    totales,
    nombreHoja: "Vendedor",
  });

  const nombreArchivo = `vendedor-${slugificar(socio.nombre)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
    },
  });
}
