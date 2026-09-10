import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Vista del dueño: cruces de peaje ya importados (con el vehículo
// vinculado si hay match) + historial de PDFs subidos. Ver migración 0082.
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const entityId = new URL(req.url).searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "Falta entityId." }, { status: 400 });

  const { data: cruces, error } = await supabase
    .from("peaje_cruces")
    .select("id, placa_raw, fecha, hora, plaza, monto, vehiculo_id, vehiculos(alias, placa)")
    .eq("owner_id", user.id)
    .eq("entity_id", entityId)
    .order("fecha", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: uploads } = await supabase
    .from("peaje_statement_uploads")
    .select("id, nombre_archivo, periodo_desde, periodo_hasta, total_cruces, total_monto, created_at")
    .eq("owner_id", user.id)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    ok: true,
    cruces: (cruces ?? []).map((c: any) => ({
      id: c.id,
      fecha: c.fecha,
      hora: c.hora,
      plaza: c.plaza,
      monto: Number(c.monto),
      placa: c.vehiculos?.placa ?? c.placa_raw,
      vehiculoAlias: c.vehiculos?.alias ?? null,
      sinVehiculo: !c.vehiculo_id,
    })),
    uploads: uploads ?? [],
  });
}
