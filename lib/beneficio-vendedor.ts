import { createAdminClient } from "@/lib/supabase/admin";

// Beneficio de plan para vendedores (migración 0200, 1 nov 2026).
// Reglas acordadas con Joel:
//   - 30 días de gracia desde el inicio.
//   - Después hacen falta 3 puntos al mes: Core = 1, Pro = 1.5, Business = 3.
//   - Puntos de sobra = reserva (tope 36 = 12 meses).
//   - Cliente que cancela antes de su 3er pago (30% perdido) resta sus puntos.
//   - Plan regalado: Core, o Pro si el vendedor declaró negocio y ya creó una
//     entidad en la app. Solo si su cuenta no tiene suscripción propia.
type Admin = ReturnType<typeof createAdminClient>;

export const DIAS_GRACIA = 30;
export const PUNTOS_META_MES = 3;
export const RESERVA_MAX = 36;

export function puntosDePlan(plan: string | null | undefined): number {
  if (plan === "core") return 1;
  if (plan === "pro") return 1.5;
  if (plan === "proplus") return 3;
  return 0;
}

export function mesDe(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type SocioFila = {
  id: string;
  email: string | null;
  tiene_negocio: boolean | null;
  approved_at: string | null;
  beneficio_inicio_at: string | null;
  puntos_reserva: number | string | null;
  beneficio_mes: string | null;
  beneficio_estado: string | null;
};

export async function procesarBeneficiosVendedores(admin: Admin, ahora = new Date()) {
  const { data: socios } = await admin
    .from("socios")
    .select("id, email, tiene_negocio, approved_at, beneficio_inicio_at, puntos_reserva, beneficio_mes, beneficio_estado")
    .eq("tipo", "vendedor")
    .eq("estado", "aprobado");

  const resumen = { revisados: 0, aplicados: 0, quitados: 0 };

  for (const s of (socios ?? []) as SocioFila[]) {
    try {
      resumen.revisados += 1;
      const inicio = new Date(s.beneficio_inicio_at ?? s.approved_at ?? ahora.toISOString());
      let reserva = Number(s.puntos_reserva ?? 0);

      // 1) Acreditar puntos de clientes nuevos (plan actual del referido).
      const { data: nuevos } = await admin
        .from("socios_vendedor_clientes")
        .select("id, referred_id")
        .eq("socio_id", s.id)
        .is("puntos", null);
      for (const c of nuevos ?? []) {
        const { data: ref } = await admin.from("users").select("plan").eq("id", c.referred_id).maybeSingle();
        const pts = puntosDePlan(ref?.plan as string | null);
        await admin.from("socios_vendedor_clientes").update({ puntos: pts }).eq("id", c.id);
        reserva += pts;
      }

      // 2) Restar puntos de clientes que cancelaron antes de su 3er pago.
      const { data: perdidos } = await admin
        .from("socios_vendedor_clientes")
        .select("id, puntos")
        .eq("socio_id", s.id)
        .eq("treinta_estado", "perdida")
        .eq("puntos_revertidos", false)
        .gt("puntos", 0);
      for (const c of perdidos ?? []) {
        reserva -= Number(c.puntos);
        await admin.from("socios_vendedor_clientes").update({ puntos_revertidos: true }).eq("id", c.id);
      }
      reserva = Math.min(RESERVA_MAX, Math.max(0, reserva));

      // 3) Estado del mes.
      const finGracia = new Date(inicio.getTime() + DIAS_GRACIA * 86_400_000);
      const mes = mesDe(ahora);
      let estado = s.beneficio_estado ?? "pendiente";
      let beneficioMes = s.beneficio_mes;
      if (ahora < finGracia) {
        estado = "gracia";
      } else if (beneficioMes !== mes) {
        beneficioMes = mes;
        if (reserva >= PUNTOS_META_MES) {
          reserva -= PUNTOS_META_MES;
          estado = "activo";
        } else {
          estado = "inactivo";
        }
      } else if (estado !== "activo" && reserva >= PUNTOS_META_MES) {
        // Vendió a mitad de mes: recupera el beneficio.
        reserva -= PUNTOS_META_MES;
        estado = "activo";
      }

      await admin
        .from("socios")
        .update({
          puntos_reserva: reserva,
          beneficio_estado: estado,
          beneficio_mes: beneficioMes,
          beneficio_inicio_at: inicio.toISOString(),
        })
        .eq("id", s.id);

      // 4) Aplicar (o quitar) el plan en la cuenta con el mismo email.
      if (!s.email) continue;
      const { data: user } = await admin
        .from("users")
        .select("id, plan, plan_origen, stripe_subscription_id, billed_by_firma_id")
        .ilike("email", s.email)
        .maybeSingle();
      if (!user) continue;

      // Si ya paga su propia suscripción, el beneficio no se mete en medio.
      if (user.stripe_subscription_id || user.billed_by_firma_id) {
        if (user.plan_origen === "vendedor") await admin.from("users").update({ plan_origen: null }).eq("id", user.id);
        continue;
      }

      const debeTener = estado === "gracia" || estado === "activo";
      if (debeTener) {
        let destino: "core" | "pro" = "core";
        if (s.tiene_negocio) {
          const { count } = await admin
            .from("business_entities")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", user.id);
          if ((count ?? 0) > 0) destino = "pro";
        }
        if (user.plan_origen === "vendedor" || user.plan === "gratis") {
          if (user.plan !== destino || user.plan_origen !== "vendedor") {
            await admin.from("users").update({ plan: destino, plan_status: "active", plan_origen: "vendedor" }).eq("id", user.id);
            resumen.aplicados += 1;
          }
        }
      } else if (user.plan_origen === "vendedor") {
        await admin.from("users").update({ plan: "gratis", plan_status: "active", plan_origen: null }).eq("id", user.id);
        resumen.quitados += 1;
      }
    } catch (err) {
      console.error(`No se pudo procesar el beneficio del vendedor ${s.id}:`, err);
    }
  }

  return resumen;
}
