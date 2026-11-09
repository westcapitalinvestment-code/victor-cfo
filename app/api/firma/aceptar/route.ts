import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Acepta una invitación del programa "Firma Accountant" (migración 0139).
// Requiere que el cliente YA esté autenticado (recién creó su contraseña
// en /firma/aceptar/[token]) — esta ruta activa plan='proplus' pagado por
// la firma en su propia fila de `users`.
//
// Usa el cliente ADMIN por el mismo motivo que /api/cpa-invite/accept: el
// UPDATE de su propio plan normalmente lo haría el flujo de Stripe
// checkout, no el usuario mismo — aquí no hay checkout del lado del
// cliente (nunca pone tarjeta), así que esta ruta hace, a mano, lo que el
// webhook de Stripe haría en el flujo normal. La validación de identidad
// (coincide el email de la sesión con el de la invitación) es la misma
// que ya usan cpa-invite y cpa-equipo.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: "Tienes que iniciar sesión o crear tu contraseña primero." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const token: string | undefined = body?.token;

  if (!token) {
    return NextResponse.json({ error: "Falta el token de invitación." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invitacion, error: fetchError } = await admin
    .from("firma_invitaciones")
    .select("id, firma_id, email, status")
    .eq("invitation_token", token)
    .maybeSingle();

  if (fetchError || !invitacion) {
    return NextResponse.json({ error: "Invitación no encontrada o inválida." }, { status: 404 });
  }

  if (invitacion.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Esta invitación fue enviada a otro correo. Inicia sesión con el correo al que llegó la invitación." },
      { status: 403 }
    );
  }

  // Idempotente — mismo patrón que cpa-invite/accept.
  if (invitacion.status === "accepted") {
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }

  const { error: updateUserError } = await admin
    .from("users")
    .update({
      plan: "proplus",
      plan_status: "active",
      billed_by_firma_id: invitacion.firma_id,
    })
    .eq("id", user.id);

  if (updateUserError) {
    return NextResponse.json({ error: updateUserError.message }, { status: 500 });
  }

  // Firma CONTABLE (migración 0209, 9 nov 2026): el mismo acceso de contable
  // (role='cpa': facturas, pagos, nómina, reportes y documentos) en
  // todas las entidades del cliente (entity_id NULL = todas, incluidas las
  // futuras). Lo personal queda apagado (share_personal=false por defecto).
  // Es la misma fila que crea "Invita a tu contable", así que el cliente la
  // ve en "Quién tiene acceso hoy" y la puede limitar o quitar. Una firma de
  // FACTURACIÓN (o sin tipo) no recibe ningún acceso.
  const { data: firma } = await admin
    .from("users")
    .select("email, firma_tipo")
    .eq("id", invitacion.firma_id)
    .maybeSingle();
  if (firma?.firma_tipo === "contable" && firma.email) {
    const { data: existente } = await admin
      .from("account_members")
      .select("id, active")
      .eq("owner_id", user.id)
      .eq("role", "cpa")
      .is("entity_id", null)
      .ilike("member_email", firma.email)
      .maybeSingle();
    const ahora = new Date().toISOString();
    const { error: accesoError } = existente
      ? existente.active
        ? { error: null }
        : await admin.from("account_members").update({ active: true, accepted_at: ahora }).eq("id", existente.id)
      : await admin.from("account_members").insert({
          owner_id: user.id,
          entity_id: null,
          member_email: firma.email,
          role: "cpa",
          active: true,
          accepted_at: ahora,
        });
    if (accesoError) {
      return NextResponse.json({ error: accesoError.message }, { status: 500 });
    }
  }

  const { error: updateInviteError } = await admin
    .from("firma_invitaciones")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invitacion.id);

  if (updateInviteError) {
    return NextResponse.json({ error: updateInviteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, alreadyAccepted: false });
}

// Detalles públicos de la invitación (antes de pedir contraseña) — mismo
// patrón que GET /api/cpa-invite/accept.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Falta el token de invitación." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invitacion, error } = await admin
    .from("firma_invitaciones")
    .select("firma_id, nombre_negocio, email, status")
    .eq("invitation_token", token)
    .maybeSingle();

  if (error || !invitacion) {
    return NextResponse.json({ error: "Invitación no encontrada o inválida." }, { status: 404 });
  }

  const { data: firma } = await admin.from("users").select("full_name, firma_tipo").eq("id", invitacion.firma_id).maybeSingle();

  return NextResponse.json({
    firmaName: firma?.full_name ?? null,
    firmaTipo: firma?.firma_tipo ?? null,
    nombreNegocio: invitacion.nombre_negocio,
    email: invitacion.email,
    status: invitacion.status,
  });
}
