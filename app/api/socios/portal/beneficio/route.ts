import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSesionSocio, COOKIE_SESION_SOCIO } from "@/lib/socio-session";
import { DIAS_GRACIA, PUNTOS_META_MES, RESERVA_MAX, mesDe } from "@/lib/beneficio-vendedor";

// Estado del beneficio de plan del vendedor (migración 0200): puntos del mes,
// reserva y si ya existe su cuenta de VICTOR con el mismo email.
export async function GET(req: NextRequest) {
  const socioId = verificarSesionSocio(req.cookies.get(COOKIE_SESION_SOCIO)?.value);
  if (!socioId) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const admin = createAdminClient();
  const { data: socio } = await admin
    .from("socios")
    .select("id, tipo, estado, email, tiene_negocio, approved_at, beneficio_inicio_at, puntos_reserva, beneficio_estado")
    .eq("id", socioId)
    .maybeSingle();
  if (!socio || socio.tipo !== "vendedor" || socio.estado !== "aprobado") {
    return NextResponse.json({ error: "Portal no disponible." }, { status: 403 });
  }

  const inicio = new Date((socio.beneficio_inicio_at as string | null) ?? (socio.approved_at as string | null) ?? Date.now());
  const graciaHasta = new Date(inicio.getTime() + DIAS_GRACIA * 86_400_000);

  const mes = mesDe(new Date());
  const { data: clientesMes } = await admin
    .from("socios_vendedor_clientes")
    .select("puntos, primer_pago_at")
    .eq("socio_id", socioId)
    .gt("puntos", 0);
  const puntosMes = (clientesMes ?? [])
    .filter((c) => c.primer_pago_at && mesDe(new Date(c.primer_pago_at as string)) === mes)
    .reduce((s, c) => s + Number(c.puntos), 0);

  let cuenta: { plan: string | null; origen: string | null } | null = null;
  if (socio.email) {
    const { data: u } = await admin.from("users").select("plan, plan_origen").ilike("email", socio.email as string).maybeSingle();
    if (u) cuenta = { plan: (u.plan as string | null) ?? null, origen: (u.plan_origen as string | null) ?? null };
  }

  return NextResponse.json({
    ok: true,
    estado: socio.beneficio_estado,
    graciaHasta: graciaHasta.toISOString(),
    enGracia: new Date() < graciaHasta,
    tieneNegocio: !!socio.tiene_negocio,
    reserva: Number(socio.puntos_reserva ?? 0),
    puntosMes,
    metaMes: PUNTOS_META_MES,
    reservaMax: RESERVA_MAX,
    email: socio.email,
    cuenta,
  });
}
