import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { liberarClienteDeFirma, DIAS_GRACIA_FIRMA } from "@/lib/firma-seats";
import { sendFirmaClienteLiberadoEmail } from "@/lib/email";

// La firma libera a un cliente: deja de pagarle el plan (su seat se resta de
// la factura wholesale al instante) y el cliente conserva Business y todos
// sus datos durante DIAS_GRACIA_FIRMA días para asumir su propio plan.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const clienteId: string | undefined = body?.clienteId;
  if (!clienteId) return NextResponse.json({ error: "Falta el cliente." }, { status: 400 });

  const admin = createAdminClient();

  const { data: yo } = await admin.from("users").select("es_firma_accountant, full_name").eq("id", user.id).maybeSingle();
  if (!yo?.es_firma_accountant) return NextResponse.json({ error: "No eres Firma Accountant." }, { status: 403 });

  const { data: cliente } = await admin.from("users").select("email, full_name").eq("id", clienteId).maybeSingle();

  const r = await liberarClienteDeFirma(admin, clienteId, user.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  if (cliente?.email) {
    await sendFirmaClienteLiberadoEmail({
      clienteEmail: cliente.email,
      clienteNombre: cliente.full_name ?? null,
      firmaNombre: yo.full_name ?? null,
      graciaHasta: r.graciaHasta!,
      dias: DIAS_GRACIA_FIRMA,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
