import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPush } from "@/lib/push";

// Cron diario — le manda un push de verdad (suena/aparece en el celular,
// con la app cerrada) a cada usuario que tenga al menos una suscripción
// activa Y algo de verdad pendiente: documentos que vencen en 7 días o
// menos, o transacciones sin categorizar. A propósito NO manda nada si no
// hay ninguna de las dos cosas — un push vacío ("no tienes pendientes")
// todos los días entrena al usuario a ignorar las notificaciones de
// VICTOR, que es justo lo contrario de lo que se busca.
//
// Corre DESPUÉS del sync nocturno de Plaid (vercel.json: Plaid a las 8:00
// UTC, este cron a la 1:00 PM UTC = 9:00 AM hora de PR) para que el conteo
// de gastos sin categorizar ya refleje las transacciones de esta madrugada.
//
// Misma protección que sync-all-plaid: header Authorization con
// CRON_SECRET, cliente admin porque itera TODOS los usuarios sin sesión.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, owner_id, endpoint, p256dh, auth");

  if (subsError) return NextResponse.json({ error: subsError.message }, { status: 500 });
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, usuariosNotificados: 0 });

  const ownerIds = Array.from(new Set(subs.map((s) => s.owner_id)));
  const hoy = new Date();
  const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let usuariosNotificados = 0;
  let suscripcionesExpiradas = 0;
  const resultados: Record<string, unknown> = {};

  for (const ownerId of ownerIds) {
    try {
      const [{ count: sinCategorizar }, { data: docsPorVencer }] = await Promise.all([
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", ownerId)
          .is("entity_id", null)
          .is("hacienda_category_id", null)
          // No contar pendientes — pueden reemplazarse por otro ID al postear.
          .eq("pending", false),
        supabase
          .from("documents")
          .select("nombre, fecha_vencimiento")
          .eq("owner_id", ownerId)
          .eq("estado", "activo")
          .not("fecha_vencimiento", "is", null)
          .lte("fecha_vencimiento", en7dias)
          .order("fecha_vencimiento", { ascending: true }),
      ]);

      const cantidadDocs = docsPorVencer?.length ?? 0;
      const cantidadGastos = sinCategorizar ?? 0;

      if (cantidadDocs === 0 && cantidadGastos === 0) {
        resultados[ownerId] = { notificado: false, razon: "nada pendiente" };
        continue;
      }

      const partes: string[] = [];
      if (cantidadDocs > 0) {
        const primero = docsPorVencer![0];
        partes.push(
          cantidadDocs === 1
            ? `"${primero.nombre}" vence el ${primero.fecha_vencimiento}`
            : `${cantidadDocs} documentos vencen esta semana`
        );
      }
      if (cantidadGastos > 0) {
        partes.push(`${cantidadGastos} gasto${cantidadGastos > 1 ? "s" : ""} sin categorizar`);
      }

      const body = partes.join(" · ");
      const misSubs = subs.filter((s) => s.owner_id === ownerId);

      for (const sub of misSubs) {
        const resultado = await enviarPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          { title: "VICTOR CFO", body, url: cantidadDocs > 0 ? "/dashboard/documentos" : "/dashboard/gastos" }
        );

        if (resultado.expirada) {
          suscripcionesExpiradas++;
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }

      usuariosNotificados++;
      resultados[ownerId] = { notificado: true, body, dispositivos: misSubs.length };
    } catch (err) {
      resultados[ownerId] = { notificado: false, error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }

  return NextResponse.json({ ok: true, usuariosNotificados, suscripcionesExpiradas, resultados });
}
