import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { esCuentaDemo } from "@/lib/demo";

// Activa el flag es_firma_accountant en el usuario logueado — primer paso
// del programa "Firma Accountant" (migración 0139, 4 oct 2026). A
// diferencia del Programa de Socios, aquí NO hay aprobación de Joel: el
// contador nos paga a nosotros (nunca al revés), así que no hay exposición
// de fraude que justifique un paso manual — queda instantáneo, self-serve.
//
// Solo pide Registro de Comerciante (obligatorio — identificación mínima
// del negocio real) y Licencia de CPA (opcional, pedido explícito de Joel:
// "no todos son CPA" — billers, bookkeepers y asesores también califican).
// No crea nada en Stripe todavía — eso pasa en la PRIMERA invitación real
// (/api/firma/invitar), no aquí.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const registroComerciante: string | undefined = body?.registroComerciante?.trim();
  const licenciaCpa: string | null = body?.licenciaCpa?.trim() || null;
  // Tipo de firma (migración 0209, 9 nov 2026): 'contable' recibe acceso de
  // contable a las entidades del cliente al aceptar; 'facturacion' no.
  const tipo: string | undefined = body?.tipo;
  const tipoValido = tipo === "contable" || tipo === "facturacion";

  // Firma ya registrada que solo escoge (o cambia) su tipo.
  if (body?.soloTipo) {
    if (!tipoValido) return NextResponse.json({ error: "Escoge el tipo de firma." }, { status: 400 });
    if (await esCuentaDemo(supabase, user.id)) return NextResponse.json({ ok: true, demo: true });
    const { error: errTipo } = await supabase.from("users").update({ firma_tipo: tipo }).eq("id", user.id);
    if (errTipo) return NextResponse.json({ error: errTipo.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!tipoValido) {
    return NextResponse.json({ error: "Escoge si tu firma es de contabilidad o de facturación." }, { status: 400 });
  }

  if (!registroComerciante) {
    return NextResponse.json({ error: "El Registro de Comerciante es obligatorio." }, { status: 400 });
  }

  if (await esCuentaDemo(supabase, user.id)) return NextResponse.json({ ok: true, demo: true });

  const { error } = await supabase
    .from("users")
    .update({
      es_firma_accountant: true,
      firma_registro_comerciante: registroComerciante,
      firma_licencia_cpa: licenciaCpa,
      firma_tipo: tipo,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Estado actual — para que la UI de /cpa sepa si ya mostrar el botón
// "Invitar cliente nuevo" directo, o primero el form de activación.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("users")
    .select("es_firma_accountant, firma_registro_comerciante, firma_licencia_cpa, firma_seats_activos, firma_tipo")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    esFirmaAccountant: !!perfil?.es_firma_accountant,
    registroComerciante: perfil?.firma_registro_comerciante ?? null,
    licenciaCpa: perfil?.firma_licencia_cpa ?? null,
    seatsActivos: perfil?.firma_seats_activos ?? 0,
    tipo: perfil?.firma_tipo ?? null,
  });
}
