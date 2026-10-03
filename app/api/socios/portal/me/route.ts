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

  const [{ data: clientes }, { data: estadosVendedor }, { data: comisiones }, { data: retenciones }] = await Promise.all([
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
      // "unica" = modelo nuevo de pago único (migración 0135, 2 oct 2026);
      // "setenta"/"treinta" = modelo viejo 70/30 (0107), sigue vivo solo
      // para clientes que ya estaban a mitad de camino antes del cambio.
      .select("id, referred_id, tipo_comision, comision_centavos, estado, created_at")
      .eq("socio_id", socioId)
      .in("tipo_comision", ["setenta", "treinta", "unica"]),
    // Retención Sección 1062.03 (migración 0138, 3 oct 2026) — una fila por
    // cada comisión de arriba, para mostrarle al vendedor cuánto le
    // retuvimos y cuánto es lo neto real que va a recibir.
    admin.from("socios_vendedor_retenciones").select("comision_id, retention_centavos").eq("socio_id", socioId),
  ]);

  const estadoPorCliente = new Map((estadosVendedor ?? []).map((e) => [e.referred_id, e]));
  const comisionesPorCliente = new Map<string, typeof comisiones>();
  for (const c of comisiones ?? []) {
    const lista = comisionesPorCliente.get(c.referred_id) ?? [];
    lista.push(c);
    comisionesPorCliente.set(c.referred_id, lista as any);
  }
  const retencionPorComision = new Map((retenciones ?? []).map((r) => [r.comision_id, Number(r.retention_centavos)]));

  let totalCobradoCentavos = 0;
  let totalPendienteCentavos = 0;
  let totalRetenidoCentavos = 0;

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

    // Neto real que recibe el vendedor — bruto de la comisión menos lo que
    // le retuvimos por 1062.03 (migración 0138), para no enseñarle un
    // número que después no cuadra con lo que de verdad le transferimos.
    const netoDe = (c: NonNullable<typeof comisiones>[number]) =>
      Number(c.comision_centavos) - (retencionPorComision.get(c.id as string) ?? 0);

    const cobrado = propiasComisiones.filter((c) => c!.estado === "pagada").reduce((sum, c) => sum + netoDe(c!), 0);
    const pendiente = propiasComisiones
      .filter((c) => c!.estado === "pendiente")
      .reduce((sum, c) => sum + netoDe(c!), 0);
    const retenido = propiasComisiones.reduce(
      (sum, c) => sum + (retencionPorComision.get(c!.id as string) ?? 0),
      0
    );
    totalCobradoCentavos += cobrado;
    totalPendienteCentavos += pendiente;
    totalRetenidoCentavos += retenido;

    return {
      id: cliente.id,
      nombre: cliente.full_name,
      plan: cliente.plan,
      registradoEn: cliente.created_at,
      estado,
      ciclo: estadoVendedor?.ciclo ?? null,
      cobradoCentavos: cobrado,
      pendienteCentavos: pendiente,
      retenidoCentavos: retenido,
    };
  });

  return NextResponse.json({
    ok: true,
    socio: { nombre: socio.nombre },
    totalCobradoCentavos,
    totalPendienteCentavos,
    totalRetenidoCentavos,
    clientes: filas,
  });
}
