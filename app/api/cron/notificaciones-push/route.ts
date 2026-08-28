import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPush } from "@/lib/push";

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

  const enUnDia = new Date(hoy.getTime() + 1 * msPorDia).toISOString().slice(0, 10);

  for (const ownerId of ownerIds) {
    try {
      const [{ count: sinCategorizar }, { data: docsEnVentana }, { data: citasEnVentana }] = await Promise.all([
        supabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", ownerId)
          .is("entity_id", null)
          .is("hacienda_category_id", null)
          .eq("pending", false),
        supabase
          .from("documents")
          .select("id, nombre, fecha_vencimiento, alerta_90, alerta_30, alerta_7")
          .eq("owner_id", ownerId)
          .eq("estado", "activo")
          .not("fecha_vencimiento", "is", null)
          .lte("fecha_vencimiento", en90dias)
          .order("fecha_vencimiento", { ascending: true }),
        supabase
          .from("citas")
          .select("id, titulo, fecha, hora, recordatorio_1dia, recordatorio_mismodia")
          .eq("owner_id", ownerId)
          .eq("hecha", false)
          .gte("fecha", hoyISO)
          .lte("fecha", enUnDia)
          .order("fecha", { ascending: true }),
      ]);

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

        const marcar: { alerta_90?: boolean; alerta_30?: boolean; alerta_7?: boolean } = {};
        if (umbral <= 90) marcar.alerta_90 = true;
        if (umbral <= 30) marcar.alerta_30 = true;
        if (umbral <= 7) marcar.alerta_7 = true;
        columnasAMarcar[doc.id] = marcar;
      }

      const citasParaAvisar: { id: string; titulo: string; dias: 0 | 1 }[] = [];
      const columnasAMarcarCitas: Record<string, { recordatorio_1dia?: boolean; recordatorio_mismodia?: boolean }> = {};

      for (const cita of citasEnVentana ?? []) {
        const dias = diasRestantes(cita.fecha as string);
        if (dias === 0 && !cita.recordatorio_mismodia) {
          citasParaAvisar.push({ id: cita.id, titulo: cita.titulo, dias: 0 });
          columnasAMarcarCitas[cita.id] = { recordatorio_mismodia: true };
        } else if (dias === 1 && !cita.recordatorio_1dia) {
          citasParaAvisar.push({ id: cita.id, titulo: cita.titulo, dias: 1 });
          columnasAMarcarCitas[cita.id] = { recordatorio_1dia: true };
        }
      }

      const cantidadDocs = docsParaAvisar.length;
      const cantidadGastos = sinCategorizar ?? 0;
      const cantidadCitas = citasParaAvisar.length;

      if (cantidadDocs === 0 && cantidadGastos === 0 && cantidadCitas === 0) {
        resultados[ownerId] = { notificado: false, razon: "nada pendiente" };
        continue;
      }

      const partes: string[] = [];
      if (cantidadCitas > 0) {
        const primera = citasParaAvisar[0];
        const cuando = primera.dias === 0 ? "es hoy" : "es mañana";
        partes.push(
          cantidadCitas === 1
            ? `"${primera.titulo}" ${cuando}`
            : `${cantidadCitas} citas próximas`
        );
      }
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

      for (const [docId, columnas] of Object.entries(columnasAMarcar)) {
        await supabase.from("documents").update(columnas).eq("id", docId);
      }
      for (const [citaId, columnas] of Object.entries(columnasAMarcarCitas)) {
        await supabase.from("citas").update(columnas).eq("id", citaId);
      }

      const url = cantidadCitas > 0 ? "/dashboard/citas" : cantidadDocs > 0 ? "/dashboard/documentos" : "/dashboard/gastos";

      for (const sub of misSubs) {
        const resultado = await enviarPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          { title: "VICTOR CFO", body, url }
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
