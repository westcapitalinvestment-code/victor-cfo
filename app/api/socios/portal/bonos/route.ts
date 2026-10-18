import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSesionSocio, COOKIE_SESION_SOCIO } from "@/lib/socio-session";
import { generarBonosOficinas, trimestreDe, trimestreActual, BONO_ACTIVACION_CENTAVOS, BONO_CLIENTE_CENTAVOS } from "@/lib/bonos-oficinas";

// Bonos de oficinas del vendedor (migración 0164): sus oficinas con portal,
// cuántos clientes ha traído cada una, y cuánto ha ganado / cobraría en el
// trimestre actual. SOLO datos propios. De los clientes de cada oficina no
// se muestra quién son (son clientes del contable): solo plan, fecha y si
// siguen activos.
export async function GET(req: NextRequest) {
  const socioId = verificarSesionSocio(req.cookies.get(COOKIE_SESION_SOCIO)?.value);
  if (!socioId) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const admin = createAdminClient();

  const { data: socio } = await admin.from("socios").select("id, tipo, estado").eq("id", socioId).maybeSingle();
  if (!socio || socio.tipo !== "vendedor" || socio.estado !== "aprobado") {
    return NextResponse.json({ error: "Portal no disponible." }, { status: 403 });
  }

  await generarBonosOficinas(admin);

  const [{ data: oficinas }, { data: bonos }] = await Promise.all([
    admin
      .from("oficinas_contables")
      .select("id, nombre, pueblo, user_id, created_at")
      .eq("socio_id", socioId)
      .not("user_id", "is", null),
    admin
      .from("socios_comisiones")
      .select("id, referred_id, oficina_id, tipo_comision, plan, comision_centavos, estado, created_at")
      .eq("socio_id", socioId)
      .in("tipo_comision", ["bono_oficina", "bono_cliente"])
      .order("created_at", { ascending: true }),
  ]);
  const filas = bonos ?? [];
  const ids = filas.map((f) => f.id as string);
  const clienteIds = filas.filter((f) => f.tipo_comision === "bono_cliente").map((f) => f.referred_id as string);

  const [{ data: retenciones }, { data: clientes }] = await Promise.all([
    ids.length ? admin.from("socios_vendedor_retenciones").select("comision_id, retention_centavos").in("comision_id", ids) : Promise.resolve({ data: [] as { comision_id: string; retention_centavos: number }[] }),
    clienteIds.length ? admin.from("users").select("id, plan_status").in("id", clienteIds) : Promise.resolve({ data: [] as { id: string; plan_status: string | null }[] }),
  ]);
  const retPorComision = new Map((retenciones ?? []).map((r) => [r.comision_id as string, Number(r.retention_centavos)]));
  const activoPorCliente = new Map((clientes ?? []).map((c) => [c.id as string, c.plan_status === "active"]));
  const neto = (f: (typeof filas)[number]) => Number(f.comision_centavos) - (retPorComision.get(f.id as string) ?? 0);

  // Por oficina
  const oficinasSalida = (oficinas ?? []).map((o) => {
    const propios = filas.filter((f) => f.oficina_id === o.id);
    const clientesOf = propios.filter((f) => f.tipo_comision === "bono_cliente");
    const activacion = propios.find((f) => f.tipo_comision === "bono_oficina");
    return {
      id: o.id as string,
      nombre: o.nombre as string,
      pueblo: (o.pueblo as string | null) ?? null,
      clientes: clientesOf.map((c, i) => ({
        n: i + 1,
        plan: c.plan as string,
        desde: c.created_at as string,
        activo: activoPorCliente.get(c.referred_id as string) ?? false,
        estado: c.estado as string,
      })),
      activacion: activacion ? { estado: activacion.estado as string, centavos: Number(activacion.comision_centavos) } : null,
      esperandoPrimerCliente: !activacion,
      ganadoBrutoCentavos: propios.reduce((s, f) => s + Number(f.comision_centavos), 0),
    };
  });

  // Por trimestre
  const porTrim = new Map<string, { trimestre: string; brutoCentavos: number; netoCentavos: number; pagadoNetoCentavos: number; pendienteNetoCentavos: number }>();
  for (const f of filas) {
    if (f.estado === "reversada") continue;
    const t = trimestreDe(f.created_at as string);
    const x = porTrim.get(t) ?? { trimestre: t, brutoCentavos: 0, netoCentavos: 0, pagadoNetoCentavos: 0, pendienteNetoCentavos: 0 };
    x.brutoCentavos += Number(f.comision_centavos);
    x.netoCentavos += neto(f);
    if (f.estado === "pagada") x.pagadoNetoCentavos += neto(f);
    else x.pendienteNetoCentavos += neto(f);
    porTrim.set(t, x);
  }
  const actual = trimestreActual();
  if (!porTrim.has(actual)) porTrim.set(actual, { trimestre: actual, brutoCentavos: 0, netoCentavos: 0, pagadoNetoCentavos: 0, pendienteNetoCentavos: 0 });

  return NextResponse.json({
    ok: true,
    trimestreActual: actual,
    reglas: { activacionCentavos: BONO_ACTIVACION_CENTAVOS, clienteCentavos: BONO_CLIENTE_CENTAVOS },
    totalPendienteNetoCentavos: filas.filter((f) => f.estado === "pendiente").reduce((s, f) => s + neto(f), 0),
    totalPagadoNetoCentavos: filas.filter((f) => f.estado === "pagada").reduce((s, f) => s + neto(f), 0),
    trimestres: Array.from(porTrim.values()).sort((a, b) => b.trimestre.localeCompare(a.trimestre)),
    oficinas: oficinasSalida,
  });
}
