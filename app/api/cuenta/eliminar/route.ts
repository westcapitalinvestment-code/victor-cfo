import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

const DIAS_DE_GRACIA = 30;

// Auto-eliminación de cuenta (self-service) — tarea #81, migración 0077.
// Ver el comentario grande en esa migración para el porqué de cada
// decisión (cancelar Stripe al final del período, 30 días de gracia,
// conservar facturas/pagos, desactivar equipo de inmediato).
//
// Requiere reconfirmar la contraseña (no solo estar logueado) — es una
// acción destructiva y el PIN de bloqueo no es suficientemente fuerte para
// esto (4 dígitos, pensado para una traba rápida de pantalla, no para
// autorizar borrar la cuenta entera). Se verifica con un cliente de
// Supabase aparte, sin persistir sesión, para no pisar la cookie de sesión
// real del usuario en esta misma respuesta.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const confirmacion = typeof body?.confirmacion === "string" ? body.confirmacion.trim().toUpperCase() : "";

  if (confirmacion !== "ELIMINAR") {
    return NextResponse.json({ error: 'Escribe "ELIMINAR" para confirmar.' }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "Escribe tu contraseña para confirmar." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Error de configuración del servidor." }, { status: 500 });
  }
  const clienteVerificacion = createSupabaseClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: errorPassword } = await clienteVerificacion.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (errorPassword) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: perfil } = await admin
    .from("users")
    .select("stripe_subscription_id, deletion_scheduled_for")
    .eq("id", user.id)
    .maybeSingle();

  // Ya había una eliminación pendiente — no reiniciamos el plazo de gracia,
  // solo confirmamos la fecha que ya estaba.
  if (perfil?.deletion_scheduled_for) {
    return NextResponse.json({ ok: true, scheduledFor: perfil.deletion_scheduled_for });
  }

  if (perfil?.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.update(perfil.stripe_subscription_id, { cancel_at_period_end: true });
    } catch {
      // Si la suscripción ya no existe en Stripe (cancelada de otra forma,
      // por ejemplo), no bloqueamos la eliminación por eso.
    }
  }

  const ahora = new Date();
  const scheduledFor = new Date(ahora.getTime() + DIAS_DE_GRACIA * 24 * 60 * 60 * 1000);

  await admin
    .from("users")
    .update({ deletion_requested_at: ahora.toISOString(), deletion_scheduled_for: scheduledFor.toISOString() })
    .eq("id", user.id);

  // Equipo vinculado se desactiva de inmediato (no espera los 30 días) —
  // deactivated_by_deletion marca cuáles desactivó ESTE flujo, para poder
  // reactivar solo esos si se cancela la eliminación.
  await admin
    .from("account_members")
    .update({ active: false, deactivated_by_deletion: true })
    .eq("owner_id", user.id)
    .eq("active", true);

  await admin
    .from("technicians")
    .update({ active: false, deactivated_by_deletion: true })
    .eq("owner_id", user.id)
    .eq("active", true);

  return NextResponse.json({ ok: true, scheduledFor: scheduledFor.toISOString() });
}
