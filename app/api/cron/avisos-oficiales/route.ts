import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaHoyPR } from "@/lib/hora-pr";
import { sendAvisoOficialEmail } from "@/lib/email";
import { notificarOwner } from "@/lib/push";
import { FUENTES, avisoAplicaA, descargarTexto, filtrarConIA, type Segmentos } from "@/lib/avisos-oficiales";

// Avisos oficiales automáticos (30 oct 2026, pedido de Joel: "nada que
// dependa de mí ... un bridge filtrado"). Cron diario que:
//   1. Lee las páginas públicas de las fuentes oficiales (lib/avisos-oficiales.ts).
//   2. Detecta enlaces nuevos (tabla avisos_vistos) — la PRIMERA corrida de
//      cada fuente solo toma línea base (no avisa de lo viejo), salvo lo
//      publicado en los últimos 7 días.
//   3. Un modelo pequeño decide si toca a lo que VICTOR cubre y lo resume
//      (solo lo que dice la fuente, sin consejos).
//   4. Lo publica en avisos_oficiales → banner en Inicio y Portal CPA.
//   5. Si es urgente (urgencia alta, o fecha límite en ≤21 días), manda push
//      + email a quien aplica (por módulo: nómina, contratistas, IVU, o
//      general) y a los contables. Máximo 1 correo por persona por corrida,
//      respeta email_marketing_baja_at.
//
// VICTOR CFO NO emite estos avisos: solo filtra y enlaza (ver
// DISCLAIMER_AVISOS). Mismo patrón de seguridad que los demás crons:
// Authorization: Bearer CRON_SECRET + cliente admin.
export const maxDuration = 300;

const MAX_ANALISIS_POR_CORRIDA = 8;
const DIAS_RECIENTE_PRIMERA_CORRIDA = 7;
const DIAS_URGENTE = 21;

function diasEntre(aISO: string, bISO: string): number {
  return Math.round((new Date(`${bISO}T12:00:00Z`).getTime() - new Date(`${aISO}T12:00:00Z`).getTime()) / 86400000);
}

async function idsDeTabla(
  admin: ReturnType<typeof createAdminClient>,
  tabla: string,
  filtro?: (q: any) => any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let desde = 0; desde < 50000; desde += 1000) {
    let q = admin.from(tabla).select("owner_id").range(desde, desde + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    for (const f of data as { owner_id: string | null }[]) if (f.owner_id) ids.add(f.owner_id);
    if (data.length < 1000) break;
  }
  return ids;
}

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const hoyISO = fechaHoyPR();
  const log: Record<string, unknown> = {};

  // ---------- 1-3. Descubrir, filtrar con IA y publicar ----------
  type Nuevo = { candidato: { url: string; titulo: string; fecha: string | null }; fuenteId: string; fuenteNombre: string };
  const porAnalizar: Nuevo[] = [];

  for (const fuente of FUENTES) {
    try {
      const html = await descargarTexto(fuente.listado);
      const candidatos = fuente.extraer(html);
      if (candidatos.length === 0) {
        log[`${fuente.id}:${fuente.listado}`] = "sin candidatos (¿cambió la página?)";
        continue;
      }
      const urls = candidatos.map((c) => c.url);
      const { data: vistos } = await admin.from("avisos_vistos").select("url").in("url", urls);
      const vistosSet = new Set((vistos ?? []).map((v) => v.url as string));

      const { count: previos } = await admin.from("avisos_vistos").select("url", { count: "exact", head: true }).eq("fuente", fuente.id);
      const primeraCorrida = (previos ?? 0) === 0;

      for (const c of candidatos) {
        if (vistosSet.has(c.url)) continue;
        if (primeraCorrida) {
          const reciente = c.fecha !== null && diasEntre(c.fecha, hoyISO) <= DIAS_RECIENTE_PRIMERA_CORRIDA;
          if (!reciente) {
            // Línea base: se marca visto sin avisar.
            await admin.from("avisos_vistos").upsert({ url: c.url, fuente: fuente.id, titulo: c.titulo, relevante: false }, { onConflict: "url" });
            continue;
          }
        }
        porAnalizar.push({ candidato: c, fuenteId: fuente.id, fuenteNombre: fuente.nombre });
      }
      log[`${fuente.id}:${fuente.listado}`] = { candidatos: candidatos.length, primeraCorrida };
    } catch (err) {
      log[`${fuente.id}:${fuente.listado}`] = { error: err instanceof Error ? err.message : "error desconocido" };
    }
  }

  // Los más recientes primero; el resto queda sin marcar y se procesa mañana.
  porAnalizar.sort((a, b) => (b.candidato.fecha ?? "").localeCompare(a.candidato.fecha ?? ""));
  const lote = porAnalizar.slice(0, MAX_ANALISIS_POR_CORRIDA);

  type Publicado = { id: string; titulo: string; resumen: string; fuenteNombre: string; url: string; temas: string[]; urgencia: string; fechaLimite: string | null };
  const publicados: Publicado[] = [];
  const analisis: Record<string, unknown> = {};

  for (const n of lote) {
    try {
      const r = await filtrarConIA({ fuenteNombre: n.fuenteNombre, candidato: n.candidato, hoyISO });
      if (!r) {
        analisis[n.candidato.url] = "respuesta de IA no interpretable (se reintenta mañana)";
        continue;
      }
      await admin.from("avisos_vistos").upsert(
        { url: n.candidato.url, fuente: n.fuenteId, titulo: n.candidato.titulo, relevante: r.relevante },
        { onConflict: "url" }
      );
      if (!r.relevante) {
        analisis[n.candidato.url] = "no relevante";
        continue;
      }
      const { data: fila, error } = await admin
        .from("avisos_oficiales")
        .insert({
          url: n.candidato.url,
          fuente: n.fuenteId,
          fuente_nombre: n.fuenteNombre,
          titulo: r.titulo,
          resumen: r.resumen,
          fecha_publicacion: n.candidato.fecha,
          fecha_limite: r.fecha_limite,
          temas: r.temas,
          urgencia: r.urgencia,
        })
        .select("id")
        .single();
      if (error || !fila) {
        analisis[n.candidato.url] = `no se pudo guardar: ${error?.message ?? "sin fila"}`;
        continue;
      }
      publicados.push({
        id: fila.id as string,
        titulo: r.titulo,
        resumen: r.resumen,
        fuenteNombre: n.fuenteNombre,
        url: n.candidato.url,
        temas: r.temas,
        urgencia: r.urgencia,
        fechaLimite: r.fecha_limite,
      });
      analisis[n.candidato.url] = "publicado";
    } catch (err) {
      analisis[n.candidato.url] = { error: err instanceof Error ? err.message : "error desconocido" };
    }
  }
  log.analisis = analisis;

  // ---------- 4-5. Push + email a quien aplica (solo urgentes) ----------
  const urgentes = publicados.filter(
    (p) => p.urgencia === "alta" || (p.fechaLimite !== null && diasEntre(hoyISO, p.fechaLimite) >= 0 && diasEntre(hoyISO, p.fechaLimite) <= DIAS_URGENTE)
  );

  let correos = 0;
  let pushes = 0;

  if (urgentes.length > 0) {
    const [nominaOwners, contratistaOwners, ivuOwners] = await Promise.all([
      idsDeTabla(admin, "payroll_employees"),
      idsDeTabla(admin, "vendors"),
      idsDeTabla(admin, "business_entities", (q) => q.eq("ivu_applies", true)),
    ]);

    type Destino = { id: string; email: string; nombre: string | null; seg: Segmentos; esContable: boolean };
    const destinos = new Map<string, Destino>();

    // Usuarios que pagan y no se dieron de baja de correos.
    for (let desde = 0; desde < 50000; desde += 1000) {
      const { data, error } = await admin
        .from("users")
        .select("id, email, full_name")
        .in("plan", ["core", "pro", "proplus"])
        .is("email_marketing_baja_at", null)
        .not("email", "is", null)
        .range(desde, desde + 999);
      if (error || !data || data.length === 0) break;
      for (const u of data) {
        destinos.set(u.id as string, {
          id: u.id as string,
          email: u.email as string,
          nombre: (u.full_name as string | null) ?? null,
          seg: { nomina: nominaOwners.has(u.id as string), contratistas: contratistaOwners.has(u.id as string), ivu: ivuOwners.has(u.id as string) },
          esContable: false,
        });
      }
      if (data.length < 1000) break;
    }

    // Contables (cualquier tema les sirve).
    const { data: miembros } = await admin.from("account_members").select("member_email").eq("role", "cpa").eq("active", true);
    const correosCpa = Array.from(new Set((miembros ?? []).map((m) => String(m.member_email ?? "").toLowerCase()).filter(Boolean)));
    if (correosCpa.length > 0) {
      const { data: cpaUsers } = await admin
        .from("users")
        .select("id, email, full_name, email_marketing_baja_at")
        .in("email", correosCpa);
      for (const u of cpaUsers ?? []) {
        if (u.email_marketing_baja_at) continue;
        destinos.set(u.id as string, {
          id: u.id as string,
          email: u.email as string,
          nombre: (u.full_name as string | null) ?? null,
          seg: { nomina: true, contratistas: true, ivu: true },
          esContable: true,
        });
      }
    }

    const orden: Record<string, number> = { alta: 0, media: 1, baja: 2 };
    urgentes.sort((a, b) => orden[a.urgencia] - orden[b.urgencia]);

    for (const d of destinos.values()) {
      // Contables reciben todos los temas (incluida "profesion"); usuarios, solo los que aplican a sus módulos.
      const aplicables = urgentes.filter((p) => d.esContable || avisoAplicaA(p.temas, d.seg));
      if (aplicables.length === 0) continue;
      const principal = aplicables[0];
      try {
        const r = await sendAvisoOficialEmail({
          toEmail: d.email,
          toName: d.nombre,
          userId: d.id,
          titulo: principal.titulo,
          resumen: principal.resumen,
          fuenteNombre: principal.fuenteNombre,
          fuenteUrl: principal.url,
          fechaLimite: principal.fechaLimite,
          esContable: d.esContable,
        });
        if (r.sent) correos++;
        await notificarOwner(d.id, {
          title: "Aviso oficial",
          body: aplicables.length > 1 ? `${principal.titulo} (+${aplicables.length - 1} más)` : principal.titulo,
          url: d.esContable ? "/cpa" : "/dashboard",
        });
        pushes++;
      } catch {
        // Best-effort por destinatario.
      }
    }

    await admin
      .from("avisos_oficiales")
      .update({ enviado_at: new Date().toISOString() })
      .in(
        "id",
        urgentes.map((u) => u.id)
      );
  }

  console.log("[avisos-oficiales]", JSON.stringify({ nuevosDetectados: porAnalizar.length, analizados: lote.length, publicados: publicados.length, urgentes: urgentes.length, correos, pushes, log }));
  return NextResponse.json({ ok: true, nuevosDetectados: porAnalizar.length, analizados: lote.length, publicados: publicados.length, urgentes: urgentes.length, correos, pushes });
}
