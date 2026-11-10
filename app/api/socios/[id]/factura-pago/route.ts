import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { decryptSecret } from "@/lib/crypto";
import { numeroFactura, pagosPendientes, pdfPagoSocio } from "@/lib/pago-socios";

export const dynamic = "force-dynamic";

// PDF "bill" del pago de la quincena de un socio, para subirlo a Mercury
// (Pay → Upload a bill). Solo el founder. Lleva los datos ACH en claro para
// que Mercury pre-llene el destinatario: se genera al momento, no se guarda.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const admin = createAdminClient();
  const [pago] = await pagosPendientes(admin, params.id);
  if (!pago) return NextResponse.json({ error: "Este socio no tiene nada pendiente de pago." }, { status: 404 });

  const { data: s } = await admin
    .from("socios")
    .select("bank_name, routing_number_encrypted, account_number_encrypted")
    .eq("id", params.id)
    .maybeSingle();
  let routing: string | null = null;
  let account: string | null = null;
  try {
    routing = s?.routing_number_encrypted ? decryptSecret(s.routing_number_encrypted) : null;
    account = s?.account_number_encrypted ? decryptSecret(s.account_number_encrypted) : null;
  } catch {
    // Sin banco legible el PDF igual sirve: Mercury toma nombre y monto, y el
    // destinatario se escoge (o se invita) a mano.
  }

  const bytes = await pdfPagoSocio(pago, { bankName: (s?.bank_name as string | null) ?? null, routing, account });
  const nombre = `${numeroFactura(pago)}-${pago.nombre.normalize("NFD").replace(/[^\w]+/g, "-")}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
