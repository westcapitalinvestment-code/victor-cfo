import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { decryptSecret } from "@/lib/crypto";

// Revela el banco/cuenta/ruta EN CLARO de un socio — solo el founder, y
// solo bajo pedido explícito (el panel nunca los trae en la carga inicial
// de la página, ver app/dashboard/cfo/socios-panel.tsx). Joel los usa para
// escribir la transferencia ACH en Mercury; nunca se guardan sin cifrar en
// Supabase (ver migración 0071 y app/api/socios/pago/[token]/route.ts).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: socio } = await admin
    .from("socios")
    .select("bank_name, account_number_encrypted, routing_number_encrypted")
    .eq("id", params.id)
    .maybeSingle();

  if (!socio?.account_number_encrypted || !socio.routing_number_encrypted) {
    return NextResponse.json({ error: "Este socio todavía no ha llenado sus datos de pago." }, { status: 404 });
  }

  try {
    return NextResponse.json({
      bankName: socio.bank_name,
      accountNumber: decryptSecret(socio.account_number_encrypted),
      routingNumber: decryptSecret(socio.routing_number_encrypted),
    });
  } catch {
    return NextResponse.json({ error: "No se pudo descifrar la información." }, { status: 500 });
  }
}
