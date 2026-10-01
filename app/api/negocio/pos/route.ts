import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Listar lotes de ventas de POS importados, agrupados por import_batch_id
// (#786, 1 oct 2026). Cada "lote" es la subida de un archivo completo, que
// puede traer varias filas (una por día/período del reporte).
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const entityId = req.nextUrl.searchParams.get("entidadId");
  if (!entityId) return NextResponse.json({ error: "Falta la entidad." }, { status: 400 });

  const { data: entidad } = await supabase.from("business_entities").select("id").eq("id", entityId).eq("owner_id", user.id).maybeSingle();
  if (!entidad) return NextResponse.json({ error: "No se encontró esa entidad." }, { status: 404 });

  const { data: filas, error } = await supabase
    .from("pos_batch_uploads")
    .select("*")
    .eq("entity_id", entityId)
    .eq("owner_id", user.id)
    .order("period_start", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lotesPorId = new Map<
    string,
    {
      importBatchId: string;
      provider: string;
      nombreArchivo: string | null;
      createdAt: string;
      periodoInicio: string;
      periodoFin: string;
      filas: number;
      grossSales: number;
      ivuEstatalMonto: number;
      ivuMunicipalMonto: number;
      tipsMonto: number;
      netSales: number;
      ivuSplitEstimado: boolean;
    }
  >();

  for (const f of filas || []) {
    const existente = lotesPorId.get(f.import_batch_id);
    if (!existente) {
      lotesPorId.set(f.import_batch_id, {
        importBatchId: f.import_batch_id,
        provider: f.provider,
        nombreArchivo: f.nombre_archivo,
        createdAt: f.created_at,
        periodoInicio: f.period_start,
        periodoFin: f.period_end,
        filas: 1,
        grossSales: Number(f.gross_sales),
        ivuEstatalMonto: Number(f.ivu_estatal_monto),
        ivuMunicipalMonto: Number(f.ivu_municipal_monto),
        tipsMonto: Number(f.tips_monto),
        netSales: Number(f.net_sales),
        ivuSplitEstimado: f.ivu_split_estimado,
      });
    } else {
      existente.filas++;
      existente.grossSales += Number(f.gross_sales);
      existente.ivuEstatalMonto += Number(f.ivu_estatal_monto);
      existente.ivuMunicipalMonto += Number(f.ivu_municipal_monto);
      existente.tipsMonto += Number(f.tips_monto);
      existente.netSales += Number(f.net_sales);
      if (f.period_start < existente.periodoInicio) existente.periodoInicio = f.period_start;
      if (f.period_end > existente.periodoFin) existente.periodoFin = f.period_end;
    }
  }

  const lotes = Array.from(lotesPorId.values()).sort((a, b) => b.periodoFin.localeCompare(a.periodoFin));

  return NextResponse.json({ lotes });
}
