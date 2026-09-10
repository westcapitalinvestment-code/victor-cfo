import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// "Paso 2" de importar un estado de peaje — recibe los cruces ya
// confirmados por el dueño (+ el r2Key que /extraer ya subió), crea el
// registro de la subida (peaje_statement_uploads) y cada cruce individual
// (peaje_cruces). Cada cruce intenta emparejar su placa contra el registro
// de vehículos de la entidad (comparación case-insensitive, sin espacios) —
// si no hay match, el cruce se guarda igual con placa_raw pero vehiculo_id
// en null, para que el dueño lo revise y agregue el vehículo si falta.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const entityId = body?.entityId as string | undefined;
  const nombreArchivo: string = body?.nombreArchivo || "estado de peaje";
  const r2Key = body?.r2Key as string | undefined;
  const cruces: unknown[] = Array.isArray(body?.cruces) ? body.cruces : [];

  if (!entityId) return NextResponse.json({ error: "Falta entityId." }, { status: 400 });
  if (!r2Key) return NextResponse.json({ error: "Falta el archivo subido (r2Key)." }, { status: 400 });
  if (cruces.length === 0) return NextResponse.json({ error: "No hay cruces para importar." }, { status: 400 });

  const { data: entidad } = await supabase.from("business_entities").select("id").eq("id", entityId).eq("owner_id", user.id).maybeSingle();
  if (!entidad) return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });

  const filas = cruces
    .map(
      (c: any): { fecha: string; hora: string | null; placa: string; plaza: string | null; monto: number } => ({
        fecha: String(c?.fecha ?? ""),
        hora: c?.hora ? String(c.hora) : null,
        placa: String(c?.placa ?? "").trim().toUpperCase(),
        plaza: c?.plaza ? String(c.plaza) : null,
        monto: Number(c?.monto),
      })
    )
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) && c.placa && Number.isFinite(c.monto) && c.monto > 0);

  if (filas.length === 0) return NextResponse.json({ error: "Ningún cruce tiene datos válidos." }, { status: 400 });

  const { data: vehiculos } = await supabase.from("vehiculos").select("id, placa").eq("owner_id", user.id).eq("entity_id", entityId);
  const placaAVehiculo = new Map((vehiculos ?? []).map((v) => [v.placa.trim().toUpperCase(), v.id]));

  const fechas = filas.map((f) => f.fecha).sort();
  const totalMonto = filas.reduce((s, f) => s + f.monto, 0);

  const { data: subida, error: errorSubida } = await supabase
    .from("peaje_statement_uploads")
    .insert({
      owner_id: user.id,
      entity_id: entityId,
      nombre_archivo: nombreArchivo,
      r2_key: r2Key,
      periodo_desde: fechas[0],
      periodo_hasta: fechas[fechas.length - 1],
      total_cruces: filas.length,
      total_monto: totalMonto,
    })
    .select("id")
    .single();

  if (errorSubida || !subida) return NextResponse.json({ error: errorSubida?.message ?? "No se pudo guardar la subida." }, { status: 500 });

  const filasInsertar = filas.map((f) => ({
    owner_id: user.id,
    entity_id: entityId,
    statement_upload_id: subida.id,
    vehiculo_id: placaAVehiculo.get(f.placa) ?? null,
    placa_raw: f.placa,
    fecha: f.fecha,
    hora: f.hora,
    plaza: f.plaza,
    monto: f.monto,
  }));

  const { error: errorCruces } = await supabase.from("peaje_cruces").insert(filasInsertar);
  if (errorCruces) return NextResponse.json({ error: errorCruces.message }, { status: 500 });

  const sinVehiculo = filasInsertar.filter((f) => !f.vehiculo_id).length;

  return NextResponse.json({ ok: true, uploadId: subida.id, totalImportados: filas.length, sinVehiculo });
}
