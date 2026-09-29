import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSesionSocio, COOKIE_SESION_SOCIO } from "@/lib/socio-session";

// Datos del portal del vendedor — SOLO su propia info: sus clientes
// referidos, el estado de cada uno, cuánto ya cobró y cuánto tiene
// pendiente. A propósito NUNCA incluye lo que ese cliente le genera de
// ingreso a WCV ni ningún dato de la economía de la empresa (pedido
// explícito de Joel, migración 0107, 29 sept 2026) — eso solo lo ve el
// founder en app/dashboard/cfo/socios-panel.tsx.
export async function GET(req: NextRequest) {
  const socioId = verificarSesionSocio(req.cookies.get(COOKIE_SESION_SOCIO)?.value);
  if (!socioId) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const admin = createAdminClient();

  const { data: socio } = await admin.from("socios").select("id, nombre, tipo, estado").eq("id", socioId).maybeSingle();
  if (!socio || socio.tipo !== "vendedor" || socio.estado !== "aprobado") {
    return NextResponse.json({ error: "Portal no disponible." }, { status: 403 });
  }

  const [{ data: clientes }, { data: estadosVendedor }, { data: comisiones }] = await Promise.all([
    admin
      .from("users")
      .select("id, full_name, email, plan, plan_status, created_at")
      .eq("referido_por_socio_id", socioId)
      .order("created_at", { ascending: false }),
    admin
      .from("socios_vendedor_clientes")
      .select("referred_id, ciclo, primer_pago_at, setenta_centavos, treinta_centavos, treinta_estado")
      .eq("socio_id", socioId),
    admin
      .from("socios_comisiones")
      .select("referred_id, tipo_comision, comision_centavos, estado, created_at")
      .eq("socio_id", socioId)
      .in("tipo_comision", ["setenta", "treinta"]),
  ]);

  const estadoPorCliente = new Map((estadosVendedor ?? []).map((e) => [e.referred_id, e]));
  const comisionesPorCliente = new Map<string, typeof comisiones>();
  for (const c of comisiones ?? []) {
    const lista = comisionesPorCliente.get(c.referred_id) ?? [];
    lista.push(c);
    comisionesPorCliente.set(c.referred_id, lista as any);
  }

  let totalCobradoCentavos = 0;
  let totalPendienteCentavos = 0;

  const filas = (clientes ?? []).map((cliente) => {
    const estadoVendedor = estadoPorCliente.get(cliente.id);
    const propiasComisiones = comisionesPorCliente.get(cliente.id) ?? [];

    let estado: "trial" | "generando_comision" | "cerrado_cobrado" | "cerrado_perdido";
    if (!estadoVendedor) {
      estado = "trial";
    } else if (estadoVendedor.treinta_estado === "liberada") {
      estado = "cerrado_cobrado";
    } else if (estadoVendedor.treinta_estado === "perdida") {
      estado = "cerrado_perdido";
    } else {
      estado = "generando_comision";
    }

    const cobrado = propiasComisiones
      .filter((c) => c!.estado === "pagada")
      .reduce((sum, c) => sum + Number(c!.comision_centavos), 0);
    const pendiente = propiasComisiones
      .filter((c) => c!.estado === "pendiente")
      .reduce((sum, c) => sum + Number(c!.comision_centavos), 0);
    totalCobradoCentavos += cobrado;
    totalPendienteCentavos += pendiente;

    return {
      id: cliente.id,
      nombre: cliente.full_name,
      plan: cliente.plan,
      registradoEn: cliente.created_at,
      estado,
      ciclo: estadoVendedor?.ciclo ?? null,
      cobradoCentavos: cobrado,
      pendienteCentavos: pendiente,
    };
  });

  return NextResponse.json({
    ok: true,
    socio: { nombre: socio.nombre },
    totalCobradoCentavos,
    totalPendienteCentavos,
    clientes: filas,
  });
}
