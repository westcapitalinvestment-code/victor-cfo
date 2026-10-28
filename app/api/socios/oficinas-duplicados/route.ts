import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { fusionarFichas } from "@/lib/oficina-contable-server";

// Posibles duplicados de oficinas (solo founder): fichas creadas por un
// vendedor (sin portal) que parecen ser la misma oficina que otra ficha con
// portal — mismo nombre normalizado y mismo pueblo (o el pueblo falta en
// alguna). Correo y teléfono ya se unen solos; esto cubre el resto. Unir
// aplica la regla de prioridad de fusionarFichas().

async function founder() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) return null;
  return createAdminClient();
}

export async function GET() {
  const admin = await founder();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  await admin.rpc("sincronizar_oficinas_contables");

  const { data } = await admin
    .from("oficinas_contables")
    .select("id, nombre, nombre_norm, pueblo, email, telefono, socio_id, owner_expira_at, user_id")
    .limit(3000);
  const filas = data ?? [];
  const conPortal = filas.filter((f) => f.user_id);
  const huerfanas = filas.filter((f) => !f.user_id);

  const socioIds = Array.from(new Set(huerfanas.map((h) => h.socio_id as string | null).filter((x): x is string => !!x)));
  const { data: socios } = socioIds.length
    ? await admin.from("socios").select("id, nombre").in("id", socioIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreSocio = new Map((socios ?? []).map((s) => [s.id as string, s.nombre as string]));

  const pares: {
    huerfana: { id: string; nombre: string; pueblo: string | null; vendedor: string | null; vigente: boolean };
    portal: { id: string; nombre: string; pueblo: string | null; email: string | null };
  }[] = [];
  const ahora = Date.now();
  for (const h of huerfanas) {
    if (!h.nombre_norm || h.nombre_norm.length < 4) continue;
    const p = conPortal.find(
      (c) => c.nombre_norm === h.nombre_norm && (!c.pueblo || !h.pueblo || c.pueblo === h.pueblo)
    );
    if (!p) continue;
    pares.push({
      huerfana: {
        id: h.id as string,
        nombre: h.nombre as string,
        pueblo: (h.pueblo as string | null) ?? null,
        vendedor: h.socio_id ? nombreSocio.get(h.socio_id as string) ?? null : null,
        vigente: !!h.socio_id && !!h.owner_expira_at && new Date(h.owner_expira_at as string).getTime() > ahora,
      },
      portal: {
        id: p.id as string,
        nombre: p.nombre as string,
        pueblo: (p.pueblo as string | null) ?? null,
        email: (p.email as string | null) ?? null,
      },
    });
  }
  return NextResponse.json({ ok: true, pares });
}

export async function POST(req: NextRequest) {
  const admin = await founder();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { huerfanaId?: string; portalId?: string } | null;
  if (!body?.huerfanaId || !body?.portalId) return NextResponse.json({ error: "Faltan datos." }, { status: 400 });

  const [{ data: h }, { data: p }] = await Promise.all([
    admin.from("oficinas_contables").select("*").eq("id", body.huerfanaId).maybeSingle(),
    admin.from("oficinas_contables").select("*").eq("id", body.portalId).maybeSingle(),
  ]);
  if (!h || !p || h.user_id || !p.user_id) return NextResponse.json({ error: "Fichas inválidas." }, { status: 400 });
  await fusionarFichas(admin, p, h);
  return NextResponse.json({ ok: true });
}
