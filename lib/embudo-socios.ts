import type { SupabaseClient } from "@supabase/supabase-js";

// Embudo y productividad de los vendedores (migración 0197).
//  - "Conocen VICTOR" = contactos que un vendedor visitó (oficinas + negocios).
//  - "Forman parte"   = personas que se registraron con un vendedor (usuarios
//    atribuidos) y, de ellas, las que pagan.
// Todo se calcula en el servidor con el historial socios_eventos (triggers).

export const ESTADOS_EMBUDO = ["pendiente", "visitado", "interesado", "demo_hecha", "rechazo"] as const;
export type EstadoEmbudo = (typeof ESTADOS_EMBUDO)[number];

export type EmbudoSocio = {
  socioId: string;
  contactos: { oficinas: number; negocios: number; total: number };
  porEstado: Record<EstadoEmbudo, number>; // oficinas + negocios, estado actual
  semana: { nuevos: number; avances: number; interesados: number; demos: number }; // últimos 7 días
  mes: { nuevos: number; avances: number }; // últimos 30 días
  semanas: { inicio: string; nuevos: number; avances: number }[]; // últimas 8 semanas (la última = actual)
  correo: { permisos: number; enviados: number; bajas: number };
  oficinasConPortal: number;
  registrados: number; // usuarios atribuidos al vendedor
  pagan: number; // de esos, con plan de pago activo o en prueba
};

const DIA = 86400000;
const vacio = (): Record<EstadoEmbudo, number> => ({ pendiente: 0, visitado: 0, interesado: 0, demo_hecha: 0, rechazo: 0 });

// Lunes (UTC) de la semana de una fecha.
function lunes(ms: number): number {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  return d.getTime() - dow * DIA;
}

export async function calcularEmbudo(
  admin: SupabaseClient,
  socioIds: string[]
): Promise<Map<string, EmbudoSocio>> {
  const salida = new Map<string, EmbudoSocio>();
  if (socioIds.length === 0) return salida;

  const ahora = Date.now();
  const hace7 = ahora - 7 * DIA;
  const hace30 = ahora - 30 * DIA;
  const inicioSemanaActual = lunes(ahora);
  const inicios = Array.from({ length: 8 }, (_, i) => inicioSemanaActual - (7 - i) * 7 * DIA);
  const desde = new Date(inicios[0]).toISOString();

  const [ofi, pro, eve, cor, usr] = await Promise.all([
    admin.from("oficinas_contables").select("socio_id, estado, user_id").in("socio_id", socioIds).limit(20000),
    admin.from("socios_prospectos").select("socio_id, seguimiento").in("socio_id", socioIds).limit(20000),
    admin.from("socios_eventos").select("socio_id, estado_anterior, estado_nuevo, created_at").in("socio_id", socioIds).gte("created_at", desde).limit(50000),
    admin.from("socios_contactos_correo").select("socio_id, paso, baja_at").in("socio_id", socioIds).limit(20000),
    admin.from("users").select("referido_por_socio_id, plan, plan_status").in("referido_por_socio_id", socioIds).limit(20000),
  ]);

  for (const id of socioIds) {
    salida.set(id, {
      socioId: id,
      contactos: { oficinas: 0, negocios: 0, total: 0 },
      porEstado: vacio(),
      semana: { nuevos: 0, avances: 0, interesados: 0, demos: 0 },
      mes: { nuevos: 0, avances: 0 },
      semanas: inicios.map((i) => ({ inicio: new Date(i).toISOString().slice(0, 10), nuevos: 0, avances: 0 })),
      correo: { permisos: 0, enviados: 0, bajas: 0 },
      oficinasConPortal: 0,
      registrados: 0,
      pagan: 0,
    });
  }

  for (const o of ofi.data ?? []) {
    const s = salida.get(o.socio_id as string);
    if (!s) continue;
    s.contactos.oficinas++;
    s.contactos.total++;
    if ((ESTADOS_EMBUDO as readonly string[]).includes(o.estado as string)) s.porEstado[o.estado as EstadoEmbudo]++;
    if (o.user_id) s.oficinasConPortal++;
  }
  for (const p of pro.data ?? []) {
    const s = salida.get(p.socio_id as string);
    if (!s) continue;
    s.contactos.negocios++;
    s.contactos.total++;
    if ((ESTADOS_EMBUDO as readonly string[]).includes(p.seguimiento as string)) s.porEstado[p.seguimiento as EstadoEmbudo]++;
  }
  for (const e of eve.data ?? []) {
    const s = salida.get(e.socio_id as string);
    if (!s) continue;
    const t = new Date(e.created_at as string).getTime();
    const esNuevo = e.estado_anterior === null;
    // Avance = cambio de estado de un contacto que ya existía.
    const esAvance = !esNuevo;
    if (t >= hace30) {
      if (esNuevo) s.mes.nuevos++;
      else s.mes.avances++;
    }
    if (t >= hace7) {
      if (esNuevo) s.semana.nuevos++;
      else s.semana.avances++;
      if (e.estado_nuevo === "interesado") s.semana.interesados++;
      if (e.estado_nuevo === "demo_hecha") s.semana.demos++;
    }
    // índice de semana (0..7)
    let idx = -1;
    for (let i = inicios.length - 1; i >= 0; i--) {
      if (t >= inicios[i]) { idx = i; break; }
    }
    if (idx >= 0) {
      if (esNuevo) s.semanas[idx].nuevos++;
      else if (esAvance) s.semanas[idx].avances++;
    }
  }
  for (const c of cor.data ?? []) {
    const s = salida.get(c.socio_id as string);
    if (!s) continue;
    s.correo.permisos++;
    if ((c.paso as number) > 0) s.correo.enviados++;
    if (c.baja_at) s.correo.bajas++;
  }
  for (const u of usr.data ?? []) {
    const s = salida.get(u.referido_por_socio_id as string);
    if (!s) continue;
    s.registrados++;
    if (u.plan && u.plan !== "gratis" && (u.plan_status === "active" || u.plan_status === "trialing")) s.pagan++;
  }
  return salida;
}

// Totales para el panel del fundador (suma de todos los vendedores + base total).
export function sumarEmbudo(lista: EmbudoSocio[]): EmbudoSocio {
  const t: EmbudoSocio = {
    socioId: "total",
    contactos: { oficinas: 0, negocios: 0, total: 0 },
    porEstado: vacio(),
    semana: { nuevos: 0, avances: 0, interesados: 0, demos: 0 },
    mes: { nuevos: 0, avances: 0 },
    semanas: lista[0]?.semanas.map((w) => ({ inicio: w.inicio, nuevos: 0, avances: 0 })) ?? [],
    correo: { permisos: 0, enviados: 0, bajas: 0 },
    oficinasConPortal: 0,
    registrados: 0,
    pagan: 0,
  };
  for (const s of lista) {
    t.contactos.oficinas += s.contactos.oficinas;
    t.contactos.negocios += s.contactos.negocios;
    t.contactos.total += s.contactos.total;
    for (const e of ESTADOS_EMBUDO) t.porEstado[e] += s.porEstado[e];
    t.semana.nuevos += s.semana.nuevos;
    t.semana.avances += s.semana.avances;
    t.semana.interesados += s.semana.interesados;
    t.semana.demos += s.semana.demos;
    t.mes.nuevos += s.mes.nuevos;
    t.mes.avances += s.mes.avances;
    s.semanas.forEach((w, i) => {
      if (t.semanas[i]) { t.semanas[i].nuevos += w.nuevos; t.semanas[i].avances += w.avances; }
    });
    t.correo.permisos += s.correo.permisos;
    t.correo.enviados += s.correo.enviados;
    t.correo.bajas += s.correo.bajas;
    t.oficinasConPortal += s.oficinasConPortal;
    t.registrados += s.registrados;
    t.pagan += s.pagan;
  }
  return t;
}
