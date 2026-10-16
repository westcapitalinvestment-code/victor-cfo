import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreoMercadeo, llenarPlantilla } from "@/lib/email-mercadeo";

// Cron de lunes a viernes: envía correos de mercadeo a prospectos B2B.
// Reglas: tope diario (mkt_config.tope_diario), primero los seguimientos
// (a los N días del primer correo, máx. 1) y luego los nuevos; pausa global
// con mkt_config.activo; nunca a quien se dio de baja o ya es usuario.
export const maxDuration = 300;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: c } = await admin.from("mkt_config").select("*").eq("id", 1).maybeSingle();
  if (!c || !c.activo) return NextResponse.json({ omitido: "Mercadeo en pausa." });
  if (!process.env.MKT_FROM_EMAIL) return NextResponse.json({ omitido: "Falta MKT_FROM_EMAIL." });
  if (!String(c.direccion_fisica || "").trim()) return NextResponse.json({ omitido: "Falta dirección física." });

  let cupo = c.tope_diario as number;
  const hoyInicio = new Date(); hoyInicio.setUTCHours(0, 0, 0, 0);
  // Cupo ya usado hoy (por si el cron corre dos veces)
  const [{ count: n1 }, { count: n2 }] = await Promise.all([
    admin.from("mkt_prospectos").select("id", { count: "exact", head: true }).gte("enviado_1_at", hoyInicio.toISOString()),
    admin.from("mkt_prospectos").select("id", { count: "exact", head: true }).gte("enviado_2_at", hoyInicio.toISOString()),
  ]);
  cupo -= (n1 ?? 0) + (n2 ?? 0);
  if (cupo <= 0) return NextResponse.json({ omitido: "Tope diario alcanzado." });

  const limiteSeg = new Date(Date.now() - (c.dias_seguimiento as number) * 86400000).toISOString();
  const { data: seguimientos } = await admin.from("mkt_prospectos").select("*")
    .eq("estado", "enviado_1").lte("enviado_1_at", limiteSeg).order("enviado_1_at").limit(cupo);
  const restante = cupo - (seguimientos?.length ?? 0);
  const { data: nuevos } = restante > 0
    ? await admin.from("mkt_prospectos").select("*").eq("estado", "pendiente").order("created_at").limit(restante)
    : { data: [] as NonNullable<typeof seguimientos> };

  // No escribir a quien ya es usuario
  const todos = [...(seguimientos ?? []), ...(nuevos ?? [])];
  const { data: usuarios } = todos.length
    ? await admin.from("users").select("email").in("email", todos.map((p) => p.email))
    : { data: [] };
  const yaUsuarios = new Set((usuarios ?? []).map((u) => String(u.email).toLowerCase()));

  let enviados = 0, errores = 0;
  for (const p of todos) {
    const esSeg = p.estado === "enviado_1";
    if (yaUsuarios.has(String(p.email).toLowerCase())) {
      await admin.from("mkt_prospectos").update({ estado: "respondio", error_detalle: "Ya es usuario" }).eq("id", p.id);
      continue;
    }
    const v = { nombre: p.nombre, empresa: p.empresa, nota: p.nota };
    const r = await enviarCorreoMercadeo({
      to: p.email,
      prospectoId: p.id,
      asunto: llenarPlantilla(esSeg ? c.asunto_2 : c.asunto_1, v),
      cuerpo: llenarPlantilla(esSeg ? c.cuerpo_2 : c.cuerpo_1, v),
      direccionFisica: c.direccion_fisica,
    });
    if (r.sent) {
      enviados++;
      await admin.from("mkt_prospectos").update(
        esSeg ? { estado: "enviado_2", enviado_2_at: new Date().toISOString() } : { estado: "enviado_1", enviado_1_at: new Date().toISOString() }
      ).eq("id", p.id);
    } else {
      errores++;
      await admin.from("mkt_prospectos").update({ estado: "error", error_detalle: r.reason ?? "Error" }).eq("id", p.id);
    }
    await espera(2000 + Math.random() * 2000); // goteo, no ráfaga
  }
  return NextResponse.json({ enviados, errores });
}
