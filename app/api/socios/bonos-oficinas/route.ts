import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { generarBonosOficinas, trimestreDe, trimestreActual } from "@/lib/bonos-oficinas";

// Datos del panel de Bonos de oficinas del founder (migración 0164). Genera
// primero los bonos que ya cumplen las reglas (idempotente) y devuelve todo
// el detalle para agrupar por trimestre → vendedor → oficina.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const admin = createAdminClient();
  await generarBonosOficinas(admin);

  const { data: bonos } = await admin
    .from("socios_comisiones")
    .select("id, socio_id, referred_id, oficina_id, tipo_comision, plan, comision_centavos, estado, created_at, fecha_pago")
    .in("tipo_comision", ["bono_oficina", "bono_cliente"])
    .order("created_at", { ascending: false })
    .limit(5000);
  const filas = bonos ?? [];

  const socioIds = Array.from(new Set(filas.map((f) => f.socio_id as string)));
  const oficinaIds = Array.from(new Set(filas.map((f) => f.oficina_id as string | null).filter((x): x is string => !!x)));
  const clienteIds = Array.from(new Set(filas.filter((f) => f.tipo_comision === "bono_cliente").map((f) => f.referred_id as string)));
  const comisionIds = filas.map((f) => f.id as string);

  const [{ data: socios }, { data: oficinas }, { data: clientes }, { data: retenciones }] = await Promise.all([
    socioIds.length ? admin.from("socios").select("id, nombre").in("id", socioIds) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    oficinaIds.length
      ? admin.from("oficinas_contables").select("id, nombre, pueblo").in("id", oficinaIds)
      : Promise.resolve({ data: [] as { id: string; nombre: string; pueblo: string | null }[] }),
    clienteIds.length
      ? admin.from("users").select("id, full_name, email, plan_status").in("id", clienteIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null; plan_status: string | null }[] }),
    comisionIds.length
      ? admin.from("socios_vendedor_retenciones").select("comision_id, retention_centavos").in("comision_id", comisionIds)
      : Promise.resolve({ data: [] as { comision_id: string; retention_centavos: number }[] }),
  ]);

  const socioPorId = new Map((socios ?? []).map((s) => [s.id as string, s.nombre as string]));
  const oficinaPorId = new Map((oficinas ?? []).map((o) => [o.id as string, o]));
  const clientePorId = new Map((clientes ?? []).map((c) => [c.id as string, c]));
  const retPorComision = new Map((retenciones ?? []).map((r) => [r.comision_id as string, Number(r.retention_centavos)]));

  const salida = filas.map((f) => {
    const of = f.oficina_id ? oficinaPorId.get(f.oficina_id as string) : null;
    const cl = f.tipo_comision === "bono_cliente" ? clientePorId.get(f.referred_id as string) : null;
    return {
      id: f.id as string,
      trimestre: trimestreDe(f.created_at as string),
      socioId: f.socio_id as string,
      vendedor: socioPorId.get(f.socio_id as string) ?? "—",
      oficinaId: (f.oficina_id as string | null) ?? null,
      oficina: of?.nombre ?? "—",
      pueblo: of?.pueblo ?? null,
      tipo: f.tipo_comision as "bono_oficina" | "bono_cliente",
      cliente: cl ? cl.full_name || cl.email || "Cliente" : null,
      clienteActivo: cl ? cl.plan_status === "active" : null,
      brutoCentavos: Number(f.comision_centavos),
      retenidoCentavos: retPorComision.get(f.id as string) ?? 0,
      estado: f.estado as "pendiente" | "pagada" | "reversada",
      creadoEn: f.created_at as string,
      fechaPago: (f.fecha_pago as string | null) ?? null,
    };
  });

  return NextResponse.json({ ok: true, trimestreActual: trimestreActual(), filas: salida });
}
