import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { generarReporteExcel, ColumnaReporte, FilaTotal } from "@/lib/reporte-excel";
import { slugificar } from "@/lib/format";

// Desglose por vendedor descargable (modelo 70/30, migración 0107, 29 sept
// 2026) — solo el founder (ver socios-panel.tsx, botón "Descargar Excel"
// dentro del desglose de un socio tipo='vendedor'). A diferencia del
// portal del propio vendedor (/socios/portal), este SÍ incluye el ingreso
// mensual bruto que cada cliente le genera a WCV — es el reporte interno
// de Joel para comparar comisión pagada vs. ingreso, nunca se expone al
// vendedor.
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
    .select("referred_id, ciclo, primer_pago_at, setenta_centavos, treinta_centavos, treinta_estado")
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

  const filas = (clientesEstado ?? []).map((c) => ({
    cliente: nombrePorId.get(c.referred_id) ?? "Cliente",
    ciclo: c.ciclo,
    primerPago: c.primer_pago_at ? new Date(c.primer_pago_at).toLocaleDateString("es-PR") : "—",
    estado: ESTADO_LABEL[c.treinta_estado] ?? c.treinta_estado,
    setenta: Number(c.setenta_centavos) / 100,
    treinta: Number(c.treinta_centavos) / 100,
    ingresoWCV: (Number(c.setenta_centavos) + Number(c.treinta_centavos)) / 100,
  }));

  const columnas: ColumnaReporte[] = [
    { header: "Cliente", key: "cliente", width: 28 },
    { header: "Ciclo", key: "ciclo", width: 12 },
    { header: "1er pago real", key: "primerPago", width: 14 },
    { header: "Estado", key: "estado", width: 24 },
    { header: "70% (setenta)", key: "setenta", width: 14, moneda: true },
    { header: "30% (treinta)", key: "treinta", width: 14, moneda: true },
    { header: "Ingreso mensual WCV", key: "ingresoWCV", width: 18, moneda: true },
  ];

  const totales: FilaTotal[] = [
    { key: "setenta", valor: filas.reduce((s, f) => s + f.setenta, 0) },
    { key: "treinta", valor: filas.reduce((s, f) => s + f.treinta, 0) },
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
