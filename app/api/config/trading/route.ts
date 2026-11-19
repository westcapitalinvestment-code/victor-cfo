import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { tieneAccesoTrading } from "@/lib/trading-plan";

// Interruptor "Activar Trading" de Configuración (19 nov 2026). El acceso lo da
// el plan (Core + Trading, Pro o Business); el interruptor solo decide si el
// módulo aparece en el menú.
async function estado() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: u } = await createAdminClient()
    .from("users")
    .select("plan, plan_status, trading_incluido, trading_activo, stripe_subscription_id, billed_by_firma_id")
    .eq("id", user.id)
    .maybeSingle();
  const founder = esFounder(user.email);
  const acceso = tieneAccesoTrading({ plan: u?.plan, tradingIncluido: u?.trading_incluido, founder });
  return { user, u, founder, acceso };
}

export async function GET() {
  const e = await estado();
  if (!e) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  return NextResponse.json({
    ok: true,
    acceso: e.acceso,
    activo: e.founder || !!e.u?.trading_activo,
    plan: e.u?.plan ?? null,
    incluidoEnPlan: e.u?.plan === "pro" || e.u?.plan === "proplus",
    // Core con suscripción propia puede agregar Trading (+$5) desde aquí.
    puedeAgregar: e.u?.plan === "core" && !e.u?.trading_incluido && !!e.u?.stripe_subscription_id && !e.u?.billed_by_firma_id,
  });
}

export async function POST(req: NextRequest) {
  const e = await estado();
  if (!e) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const activo = body?.activo === true;
  if (activo && !e.acceso) {
    return NextResponse.json({ error: "Tu plan no incluye Trading. Agrégalo por +$5 al mes o sube a Pro." }, { status: 403 });
  }
  const { error } = await createAdminClient().from("users").update({ trading_activo: activo }).eq("id", e.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, activo });
}
