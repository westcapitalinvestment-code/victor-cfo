import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconciliarEvidenciaEntidad, transaccionesSinEvidencia } from "@/lib/reconciliar-evidencia";

// Vista del dueño: evidencia reportada por técnicos + cuáles transacciones
// bancarias de una categoría "con evidencia requerida" NO tienen ninguna
// evidencia que las respalde (la bandera roja de mal uso). Corre la
// reconciliación primero (barata, ver lib/reconciliar-evidencia.ts) para
// que cualquier transacción que llegó del banco después de la evidencia
// quede casada antes de construir la respuesta.
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const entityId = new URL(req.url).searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "Falta entityId." }, { status: 400 });

  const { data: entidad } = await supabase.from("business_entities").select("id").eq("id", entityId).eq("owner_id", user.id).maybeSingle();
  if (!entidad) return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });

  const admin = createAdminClient();
  await reconciliarEvidenciaEntidad(admin, entityId);

  const { data: logs, error } = await supabase
    .from("expense_evidence_logs")
    .select("id, monto, fecha, r2_key, nota, estado, created_at, technicians(name), expense_evidence_types(nombre)")
    .eq("owner_id", user.id)
    .eq("entity_id", entityId)
    .order("fecha", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sinEvidencia = await transaccionesSinEvidencia(admin, entityId);

  return NextResponse.json({
    ok: true,
    logs: (logs ?? []).map((l: any) => ({
      id: l.id,
      monto: Number(l.monto),
      fecha: l.fecha,
      r2Key: l.r2_key,
      nota: l.nota,
      estado: l.estado,
      tecnicoNombre: l.technicians?.name ?? "—",
      tipoNombre: l.expense_evidence_types?.nombre ?? "—",
    })),
    sinEvidencia,
  });
}
