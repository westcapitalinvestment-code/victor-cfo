import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { liberarClienteDeFirma } from "@/lib/firma-seats";

// El PROPIO cliente (invitado por una firma) decide dejar de depender del
// plan de su contador — típicamente porque cambió de contable. Se libera de
// la firma (que deja de pagar su seat) y conserva Business 30 días; el front
// lo manda enseguida al Checkout para que ponga su propia tarjeta.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createAdminClient();
  const { data: yo } = await admin.from("users").select("billed_by_firma_id").eq("id", user.id).maybeSingle();

  // Ya fue liberado (doble click / reintento): idempotente, seguir al checkout.
  if (!yo?.billed_by_firma_id) return NextResponse.json({ ok: true, yaLiberado: true });

  const r = await liberarClienteDeFirma(admin, user.id, yo.billed_by_firma_id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
