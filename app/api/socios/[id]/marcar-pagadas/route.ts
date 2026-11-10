import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";

// Marca como pagadas las comisiones de un pago de quincena (las mismas que
// iban en el PDF que se subió a Mercury) — solo el founder. Recibe los ids
// exactos para no marcar por error una comisión que entró después.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 500) : [];
  if (ids.length === 0) return NextResponse.json({ error: "Faltan las comisiones." }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("socios_comisiones")
    .update({ estado: "pagada", fecha_pago: new Date().toISOString() })
    .eq("socio_id", params.id)
    .eq("estado", "pendiente")
    .in("id", ids)
    .select("id");
  if (error) return NextResponse.json({ error: "No se pudieron marcar como pagadas." }, { status: 500 });
  return NextResponse.json({ ok: true, ids: (data ?? []).map((r) => r.id) });
}
