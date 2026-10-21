import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { actorNominaPorFila } from "@/lib/nomina-server";
import { cargarDatosTalonarios } from "@/lib/nomina-talonarios-server";
import { cargarLogoExcel } from "@/lib/reporte-excel";

// Talonarios (recibos de pago) de una corrida (21 oct 2026, pedido de Javier Pabón,
// AVG Accounting). Devuelve, por empleado, todo lo que lleva un talonario. La impresión/PDF
// se arma en el cliente; el envío por correo está en ./enviar.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const corridaId = req.nextUrl.searchParams.get("corridaId") ?? "";
  const soloEmpleado = req.nextUrl.searchParams.get("employeeId");
  if (!corridaId) return NextResponse.json({ error: "Falta la corrida." }, { status: 400 });
  const a = await actorNominaPorFila(supabase, "payroll_runs", corridaId);
  if ("error" in a) return a.error;
  const { g, entityId } = a;

  const r = await cargarDatosTalonarios(g, entityId, corridaId, soloEmpleado);
  if (!r.datos) return NextResponse.json({ error: r.error }, { status: r.status ?? 500 });
  const { logoR2Key, ...datos } = r.datos;

  // Logo como data URL para la ventana de impresión.
  const logo = await cargarLogoExcel(logoR2Key);
  const logoDataUrl = logo ? `data:image/${logo.extension};base64,${Buffer.from(logo.buffer).toString("base64")}` : null;

  // Último envío por correo (de la bitácora) para avisar antes de reenviar.
  const { data: envios } = await g.db
    .from("payroll_audit_log")
    .select("created_at, actor_email, detalle")
    .eq("entity_id", entityId)
    .eq("accion", "talonarios_enviados")
    .order("created_at", { ascending: false })
    .limit(30);
  const ultimo = (envios ?? []).find((e) => (e.detalle as { run_id?: string })?.run_id === corridaId);

  return NextResponse.json({
    ok: true,
    ...datos,
    logo: logoDataUrl,
    ultimoEnvio: ultimo
      ? { en: ultimo.created_at as string, por: (ultimo.actor_email as string | null) ?? null, enviados: Number((ultimo.detalle as { enviados?: number })?.enviados ?? 0) }
      : null,
  });
}
