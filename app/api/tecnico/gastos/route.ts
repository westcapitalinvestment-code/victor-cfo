import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { obtenerContextoTecnico } from "@/lib/tecnico-contexto";
import { subirArchivoR2 } from "@/lib/r2";
import { reconciliarEvidenciaEntidad } from "@/lib/reconciliar-evidencia";

const TAMANO_MAX_BYTES = 15 * 1024 * 1024;

// El técnico reporta evidencia de un gasto (foto de la factura + monto +
// fecha) — mismo patrón de subida que /api/tecnico/facturas/[id]/evidencia
// (dataUrl base64 → R2), pero guarda en expense_evidence_logs en vez de
// invoice_attachments. Ver migración 0081 para el contexto completo.
export async function POST(req: NextRequest) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const tipoId = String(body?.tipoId ?? "");
  const monto = Number(body?.monto);
  const fecha = String(body?.fecha ?? "");
  const nota = typeof body?.nota === "string" ? body.nota.trim().slice(0, 200) : null;
  const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";

  if (!tipoId) return NextResponse.json({ error: "Falta el tipo de gasto." }, { status: 400 });
  if (!Number.isFinite(monto) || monto <= 0) return NextResponse.json({ error: "Monto inválido." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return NextResponse.json({ error: "Falta la foto de la factura/recibo." }, { status: 400 });

  const { data: tipo } = await ctx.admin
    .from("expense_evidence_types")
    .select("id")
    .eq("id", tipoId)
    .eq("entity_id", ctx.tecnico.entity_id)
    .eq("activo", true)
    .maybeSingle();
  if (!tipo) return NextResponse.json({ error: "Ese tipo de gasto ya no está disponible." }, { status: 404 });

  const contentType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > TAMANO_MAX_BYTES) return NextResponse.json({ error: "La imagen pesa más de 15MB." }, { status: 400 });

  const extension = contentType.split("/")[1] || "jpg";
  const key = `gastos-evidencia/${ctx.tecnico.owner_id}/${ctx.tecnico.id}-${Date.now()}-${randomUUID()}.${extension}`;

  try {
    await subirArchivoR2(key, buffer, contentType);
  } catch (err) {
    console.error("Error subiendo evidencia de gasto a R2:", err);
    return NextResponse.json({ error: "No se pudo subir la foto. Intenta de nuevo." }, { status: 500 });
  }

  const { data: log, error } = await ctx.admin
    .from("expense_evidence_logs")
    .insert({
      owner_id: ctx.tecnico.owner_id,
      entity_id: ctx.tecnico.entity_id,
      technician_id: ctx.tecnico.id,
      tipo_id: tipoId,
      monto,
      fecha,
      r2_key: key,
      nota,
    })
    .select("id")
    .single();

  if (error || !log) return NextResponse.json({ error: error?.message ?? "No se pudo guardar el reporte." }, { status: 500 });

  // Match inmediato por si la transacción ya llegó del banco — si no, se
  // reconcilia después, cuando el dueño abre la pestaña Gastos en Equipo.
  await reconciliarEvidenciaEntidad(ctx.admin, ctx.tecnico.entity_id).catch(() => {});

  return NextResponse.json({ ok: true, id: log.id });
}
