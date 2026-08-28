import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPush } from "@/lib/push";

// Cron diario — le manda un push de verdad (suena/aparece en el celular,
// con la app cerrada) a cada usuario que tenga al menos una suscripción
// activa Y algo de verdad pendiente: documentos que cruzan un umbral de
// vencimiento (90, 30 o 7 días) por primera vez, o transacciones sin
// categorizar. A propósito NO manda nada si no hay ninguna de las dos
// cosas — un push vacío ("no tienes pendientes") todos los días entrena
// al usuario a ignorar las notificaciones de VICTOR, que es justo lo
// contrario de lo que se busca.
//
// Los umbrales usan las columnas alerta_90/alerta_30/alerta_7 de
// documents para avisar UNA sola vez por umbral cruzado, no todos los
// días mientras el documento siga pendiente. Al marcar un umbral se
// marcan también los umbrales "menos urgentes" (ej. si un documento
// aparece por primera vez a 5 días de vencer, se marcan alerta_7,
// alerta_30 y alerta_90 juntas, porque ya pasamos esos tres umbrales).
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
  const msPorDia = 24 * 60 * 60 * 1000;
  const en90dias = new Date(hoy.getTime() + 90 * msPorDia).toISOString().slice(0, 10);
  const hoyISO = hoy.toISOString().slice(0, 10);

  function diasRestantes(fechaISO: string): number {
    const objetivo = new Date(fechaISO + "T00:00:00Z");
    const base = new Date(hoyISO + "T00:00:00Z");
    return Math.round((objetivo.getTime() - base.getTime()) / msPorDia);
  }

  let usuariosNotificados = 0;
  let suscripcionesExpiradas = 0;
  const resultados: Record<string, unknown> = {};

  for (const ownerId of ownerIds) {
    try {
      const [{ count: sinCategorizar }, { data: docsEnVentana }] = await Promise.all([
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
          .select("id, nombre, fecha_vencimiento, alerta_90, alerta_30, alerta_7")
          .eq("owner_id", ownerId)
          .eq("estado", "activo")
          .not("fecha_vencimiento", "is", null)
          .lte("fecha_vencimiento", en90dias)
          .order("fecha_vencimiento", { ascending: true }),
      ]);

      // De todos los documentos dentro de la ventana de 90 días, nos
      // interesan solo los que CRUZAN un umbral por primera vez hoy (no
      // los que ya avisamos en un cron anterior).
      const docsParaAvisar: { id: string; nombre: string; dias: number; umbral: 90 | 30 | 7 }[] = [];
      const columnasAMarcar: Record<string, { alerta_90?: boolean; alerta_30?: boolean; alerta_7?: boolean }> = {};

      for (const doc of docsEnVentana ?? []) {
        const dias = diasRestantes(doc.fecha_vencimiento as string);
        let umbral: 90 | 30 | 7 | null = null;
        if (dias <= 7 && !doc.alerta_7) umbral = 7;
        else if (dias <= 30 && !doc.alerta_30) umbral = 30;
        else if (dias <= 90 && !doc.alerta_90) umbral = 90;

        if (umbral === null) continue;

        docsParaAvisar.push({ id: doc.id, nombre: doc.nombre, dias, umbral });

        // Al cruzar un umbral, se cruzaron también los menos urgentes.
        const marcar: { alerta_90?: boolean; alerta_30?: boolean; alerta_7?: boolean } = {};
        if (umbral <= 90) marcar.alerta_90 = true;
        if (umbral <= 30) marcar.alerta_30 = true;
        if (umbral <= 7) marcar.alerta_7 = true;
        columnasAMarcar[doc.id] = marcar;
      }

      const cantidadDocs = docsParaAvisar.length;
      const cantidadGastos = sinCategorizar ?? 0;

      if (cantidadDocs === 0 && cantidadGastos === 0) {
        resultados[ownerId] = { notificado: false, razon: "nada pendiente" };
        continue;
      }

      const partes: string[] = [];
      if (cantidadDocs > 0) {
        const primero = docsParaAvisar[0];
        const cuando = primero.dias < 0 ? `venció hace ${Math.abs(primero.dias)} día(s)` : primero.dias === 0 ? "vence hoy" : `vence en ${primero.dias} día(s)`;
        partes.push(
          cantidadDocs === 1
            ? `"${primero.nombre}" ${cuando}`
            : `${cantidadDocs} documentos con vencimiento próximo`
        );
      }
      if (cantidadGastos > 0) {
        partes.push(`${cantidadGastos} gasto${cantidadGastos > 1 ? "s" : ""} sin categorizar`);
      }

      const body = partes.join(" · ");
      const misSubs = subs.filter((s) => s.owner_id === ownerId);

      // Marcar los umbrales cruzados ANTES de intentar el push — el aviso
      // ya se decidió mostrar (push aquí y/o saludo diario de VICTOR), y
      // no queremos re-marcar en el próximo cron solo porque el push
      // falló por una suscripción expirada.
      for (const [docId, columnas] of Object.entries(columnasAMarcar)) {
        await supabase.from("documents").update(columnas).eq("id", docId);
      }

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
