import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendFirmaGraciaRecordatorioEmail } from "@/lib/email";

// Cron diario (6 oct 2026) para clientes liberados por su firma de contadores:
//  1) Recordatorio semanal (cada 7 días) mientras siga en gracia y no haya
//     contratado su plan — más uno final cuando faltan ≤2 días. Si tiene
//     addons activos, el correo se lo dice (Joel: "menos si tiene addon activo").
//  2) Al vencer la gracia, baja a 'gratis'. Contratar el plan limpia
//     firma_gracia_hasta (checkout.session.completed en el webhook), así que
//     cualquier fila que llegue aquí con la gracia vencida NO pagó. No se borra
//     ningún dato — solo cambia el plan.
export const maxDuration = 60;

const DIA_MS = 24 * 60 * 60 * 1000;

const ETIQUETA_ADDON: Record<string, string> = {
  addon_tecnicos_status: "Técnicos",
  addon_pagos_status: "Pagos",
  addon_admin_status: "Secretaria",
  addon_administrador_status: "Administrador",
  addon_entidades_status: "Entidades adicionales",
};

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const ahora = Date.now();
  const ahoraISO = new Date(ahora).toISOString();

  // 1) Gracia vencida → gratis
  const { data: vencidos, error } = await supabase
    .from("users")
    .select("id")
    .not("firma_gracia_hasta", "is", null)
    .lt("firma_gracia_hasta", ahoraISO)
    .is("billed_by_firma_id", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let degradados = 0;
  for (const u of vencidos ?? []) {
    const { error: e } = await supabase
      .from("users")
      .update({
        plan: "gratis",
        plan_status: "active",
        firma_gracia_hasta: null,
        firma_liberado_de_id: null,
        firma_gracia_ultimo_aviso_at: null,
      })
      .eq("id", u.id);
    if (!e) degradados++;
  }

  // 2) Recordatorios a quienes siguen en gracia
  const { data: enGracia, error: errGracia } = await supabase
    .from("users")
    .select(
      "id, email, full_name, firma_gracia_hasta, firma_liberado_de_id, firma_gracia_ultimo_aviso_at, addon_tecnicos_status, addon_pagos_status, addon_admin_status, addon_administrador_status, addon_entidades_status"
    )
    .not("firma_gracia_hasta", "is", null)
    .gte("firma_gracia_hasta", ahoraISO)
    .is("billed_by_firma_id", null);

  if (errGracia) return NextResponse.json({ error: errGracia.message }, { status: 500 });

  let recordatorios = 0;
  const fallos: Record<string, string> = {};
  for (const u of enGracia ?? []) {
    if (!u.email) continue;
    const hasta = new Date(u.firma_gracia_hasta as string).getTime();
    const diasRestantes = Math.max(Math.ceil((hasta - ahora) / DIA_MS), 0);
    const ultimo = u.firma_gracia_ultimo_aviso_at ? new Date(u.firma_gracia_ultimo_aviso_at as string).getTime() : 0;
    const desdeUltimo = ahora - ultimo;

    const tocaSemanal = desdeUltimo >= 7 * DIA_MS - 60 * 60 * 1000; // tolerancia de 1h por jitter del cron
    const tocaFinal = diasRestantes <= 2 && desdeUltimo >= 2 * DIA_MS - 60 * 60 * 1000;
    if (!tocaSemanal && !tocaFinal) continue;

    let firmaNombre: string | null = null;
    if (u.firma_liberado_de_id) {
      const { data: f } = await supabase.from("users").select("full_name").eq("id", u.firma_liberado_de_id).maybeSingle();
      firmaNombre = f?.full_name ?? null;
    }

    const addons = Object.entries(ETIQUETA_ADDON)
      .filter(([col]) => (u as Record<string, unknown>)[col] === "activo")
      .map(([, etiqueta]) => etiqueta);

    const r = await sendFirmaGraciaRecordatorioEmail({
      clienteEmail: u.email as string,
      clienteNombre: (u.full_name as string | null) ?? null,
      firmaNombre,
      graciaHasta: u.firma_gracia_hasta as string,
      diasRestantes,
      addons,
    });
    if (r.sent) {
      await supabase.from("users").update({ firma_gracia_ultimo_aviso_at: ahoraISO }).eq("id", u.id);
      recordatorios++;
    } else {
      fallos[u.id as string] = r.reason ?? "desconocido";
    }
  }

  console.log("[firma-gracia]", JSON.stringify({ vencidos: vencidos?.length ?? 0, degradados, recordatorios, fallos }));
  return NextResponse.json({ ok: true, revisados: vencidos?.length ?? 0, degradados, recordatorios, fallos });
}
