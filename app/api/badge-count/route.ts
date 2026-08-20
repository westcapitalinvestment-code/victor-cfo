import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cuenta cuántas "cosas pendientes" tiene el usuario ahora mismo — lo que
// se muestra como el numerito rojo sobre el ícono de la app instalada
// (Badging API). Dos fuentes, las mismas que ya usa VICTOR/el dashboard:
// transacciones sin categorizar (todas, no solo un lote) + documentos que
// vencen en 7 días o menos (lo mismo que la Bóveda pinta en rojo — si
// contáramos también los de 30/90 días el número saldría inflado y dejaría
// de sentirse "urgente", que es el punto del badge).
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const hoy = new Date();
  const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ count: sinCategorizar }, { count: docsUrgentes }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .is("entity_id", null)
      .is("hacienda_category_id", null),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("estado", "activo")
      .not("fecha_vencimiento", "is", null)
      .lte("fecha_vencimiento", en7dias),
  ]);

  const count = (sinCategorizar ?? 0) + (docsUrgentes ?? 0);
  return NextResponse.json({ count });
}
