import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { rangoTrimestre } from "@/lib/bonos-oficinas";

// Liquida los bonos de oficinas de UN vendedor hasta el fin de un trimestre
// (migración 0164). Se llama DESPUÉS de transferirle el efectivo por fuera de
// la app, igual que "marcar comisión como pagada". Antes de marcar pagado,
// revisa que cada cliente siga activo: si canceló, ese bono de $10 se
// reversa (y se borra su fila de retención para no inflar el acumulado).
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const socioId = typeof body?.socioId === "string" ? body.socioId : "";
  const trimestre = typeof body?.trimestre === "string" && /^\d{4}-Q[1-4]$/.test(body.trimestre) ? body.trimestre : "";
  if (!socioId || !trimestre) return NextResponse.json({ error: "Faltan datos." }, { status: 400 });

  const admin = createAdminClient();
  const { hasta } = rangoTrimestre(trimestre);

  const { data: pendientes } = await admin
    .from("socios_comisiones")
    .select("id, referred_id, tipo_comision")
    .eq("socio_id", socioId)
    .eq("estado", "pendiente")
    .in("tipo_comision", ["bono_oficina", "bono_cliente"])
    .lt("created_at", hasta);
  const filas = pendientes ?? [];
  if (filas.length === 0) return NextResponse.json({ ok: true, pagados: 0, reversados: 0 });

  const clienteIds = filas.filter((f) => f.tipo_comision === "bono_cliente").map((f) => f.referred_id as string);
  const { data: clientes } = clienteIds.length
    ? await admin.from("users").select("id, plan_status").in("id", clienteIds)
    : { data: [] as { id: string; plan_status: string | null }[] };
  const activos = new Set((clientes ?? []).filter((c) => c.plan_status === "active").map((c) => c.id as string));

  const aPagar: string[] = [];
  const aReversar: string[] = [];
  for (const f of filas) {
    if (f.tipo_comision === "bono_cliente" && !activos.has(f.referred_id as string)) aReversar.push(f.id as string);
    else aPagar.push(f.id as string);
  }

  if (aPagar.length) {
    await admin
      .from("socios_comisiones")
      .update({ estado: "pagada", fecha_pago: new Date().toISOString() })
      .in("id", aPagar);
  }
  if (aReversar.length) {
    await admin.from("socios_comisiones").update({ estado: "reversada" }).in("id", aReversar);
    await admin.from("socios_vendedor_retenciones").delete().in("comision_id", aReversar);
  }
  return NextResponse.json({ ok: true, pagados: aPagar.length, reversados: aReversar.length });
}
