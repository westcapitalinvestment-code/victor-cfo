import { NextRequest, NextResponse } from "next/server";
import { contableAutenticado, vincularVendedorPorCodigo } from "@/lib/oficina-contable-server";

// El contable se registró con el link de un vendedor (/registro/cpa?v=CÓDIGO).
// Deja su ficha a nombre del vendedor para que cuente el bono de oficinas.
export async function POST(req: NextRequest) {
  const ctx = await contableAutenticado();
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { codigo?: unknown } | null;
  const codigo = typeof body?.codigo === "string" ? body.codigo : "";
  const r = await vincularVendedorPorCodigo(ctx, codigo);
  // Nunca bloquea el registro del contable: si el código no sirve, simplemente no se vincula.
  return NextResponse.json({ ok: true, vinculado: r.ok && !r.motivo });
}
