import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { enviarCorreoMercadeo, llenarPlantilla } from "@/lib/email-mercadeo";

// Manda el correo 1 de prueba al correo del founder.
export async function POST() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user || !esFounder(user.email) || !user.email) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { data: c } = await createAdminClient().from("mkt_config").select("*").eq("id", 1).maybeSingle();
  if (!c) return NextResponse.json({ error: "Sin configuración." }, { status: 500 });
  const v = { nombre: "Carlos", empresa: "Ortiz & Asociados CPA", nota: "" };
  const r = await enviarCorreoMercadeo({
    to: user.email,
    prospectoId: "prueba",
    asunto: llenarPlantilla(c.asunto_1, v),
    cuerpo: llenarPlantilla(c.cuerpo_1, v),
    direccionFisica: c.direccion_fisica,
  });
  if (!r.sent) return NextResponse.json({ error: r.reason }, { status: 400 });
  return NextResponse.json({ ok: true, a: user.email });
}
