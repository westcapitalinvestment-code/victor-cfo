import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { descargarBytesR2 } from "@/lib/r2";
import { sendFormulario480Email } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const anio = Number(body?.anio);
  const entityId: string | null = body?.entityId || null;
  const enviar = body?.enviar !== false;
  const items: { key: string; vendorId: string }[] = Array.isArray(body?.items) ? body.items : [];
  if (!anio || anio < 2000 || items.length === 0) return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });

  const prefijo = `480-6sp/${user.id}/`;
  const { data: perfil } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const { data: ent } = entityId ? await supabase.from("business_entities").select("name").eq("id", entityId).maybeSingle() : { data: null };
  const remitente = (ent as { name?: string } | null)?.name || (perfil as { full_name?: string } | null)?.full_name || "tu cliente";

  const resultados: { vendorId: string; nombre: string; guardado: boolean; enviado: boolean; motivo?: string }[] = [];
  for (const it of items) {
    if (!it.key?.startsWith(prefijo) || !it.vendorId) continue;
    const { data: v } = await supabase.from("vendors").select("id, name, email, entity_id").eq("id", it.vendorId).eq("owner_id", user.id).maybeSingle();
    if (!v) continue;
    const vend = v as { id: string; name: string; email: string | null; entity_id: string | null };
    const { data: fila, error } = await supabase
      .from("vendor_480_forms")
      .insert({ owner_id: user.id, entity_id: vend.entity_id ?? entityId, vendor_id: vend.id, anio, r2_key: it.key })
      .select("id").single();
    if (error || !fila) {
      resultados.push({ vendorId: vend.id, nombre: vend.name, guardado: false, enviado: false, motivo: error?.message });
      continue;
    }
    let enviado = false;
    let motivo: string | undefined;
    if (enviar) {
      if (!vend.email) motivo = "Sin correo";
      else {
        try {
          const pdf = await descargarBytesR2(it.key);
          const r = await sendFormulario480Email({ toEmail: vend.email, nombre: vend.name, remitente, anio, pdf });
          enviado = r.sent;
          if (!r.sent) motivo = r.reason;
          else await supabase.from("vendor_480_forms").update({ enviado_en: new Date().toISOString(), enviado_a: vend.email }).eq("id", (fila as { id: string }).id);
        } catch (e) {
          motivo = e instanceof Error ? e.message : "Error enviando";
        }
      }
    }
    resultados.push({ vendorId: vend.id, nombre: vend.name, guardado: true, enviado, motivo });
  }
  return NextResponse.json({ resultados });
}
