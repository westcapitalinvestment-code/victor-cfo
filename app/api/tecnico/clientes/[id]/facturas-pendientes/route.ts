import { NextRequest, NextResponse } from "next/server";
import { obtenerContextoTecnico } from "@/lib/tecnico-contexto";

// Facturas ya existentes de este cliente que el técnico puede cobrar en
// campo (pedido de Joel: "cobrar facturas pendientes del cliente... ve y
// cobra facturas vencidas en campo"). Requiere el permiso cobraVencidas.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await obtenerContextoTecnico(req);
  if (!ctx) return NextResponse.json({ error: "Sesión de técnico expirada." }, { status: 401 });
  if (!ctx.permisos.cobraVencidas) {
    return NextResponse.json({ error: "No tienes permiso para cobrar facturas pendientes." }, { status: 403 });
  }

  const { data } = await ctx.admin
    .from("invoices")
    .select("id, numero, total, fecha_vencimiento, estado")
    .eq("entity_id", ctx.tecnico.entity_id)
    .eq("client_id", params.id)
    .in("estado", ["enviada", "vista", "vencida"])
    .order("fecha_vencimiento", { ascending: true });

  return NextResponse.json({ ok: true, facturas: data ?? [] });
}
