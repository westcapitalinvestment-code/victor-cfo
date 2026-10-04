import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  if (!registroComerciante) {
    return NextResponse.json({ error: "El Registro de Comerciante es obligatorio." }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({
      es_firma_accountant: true,
      firma_registro_comerciante: registroComerciante,
      firma_licencia_cpa: licenciaCpa,
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
    .select("es_firma_accountant, firma_registro_comerciante, firma_licencia_cpa, firma_seats_activos")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    esFirmaAccountant: !!perfil?.es_firma_accountant,
    registroComerciante: perfil?.firma_registro_comerciante ?? null,
    licenciaCpa: perfil?.firma_licencia_cpa ?? null,
    seatsActivos: perfil?.firma_seats_activos ?? 0,
  });
}
