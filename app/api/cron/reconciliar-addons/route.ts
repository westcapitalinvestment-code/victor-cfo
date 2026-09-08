import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, priceIdAddonEntidadAdicional, priceIdAddonSecretaria, priceIdAddonAdministrador } from "@/lib/stripe";

// Cron diario — red de seguridad para los 3 addons "por seat" (Entidades
// adicionales, Secretaria, Administrador). Cada uno ya se sincroniza con
// Stripe justo después de la acción que lo dispara (crear entidad, invitar/
// activar/desactivar un admin) — ver /api/stripe/addon-entidades/sincronizar
// y /api/stripe/addon-admin/sincronizar. El problema real (8 sept 2026,
// reportado por Joel — task #490): esa llamada es "fire and forget" desde el
// navegador (`.catch(() => {})`), así que si la red falla, el usuario cierra
// la pestaña antes de que termine, o Stripe tiene un hiccup transitorio, la
// entidad/admin queda creada en nuestra base pero Stripe nunca se enteró —
// el cliente sigue usando el addon sin que se le cobre (fuga de ingreso) o,
// al revés, sigue cobrado por algo que ya borró.
//
// Esta ruta recorre TODOS los usuarios Pro/Pro+ con suscripción activa,
// recalcula los seats reales de cada addon desde las tablas fuente
// (business_entities / account_members / admin_invitations), y si no
// coincide con lo que Stripe tiene, lo corrige — mismo patrón exacto que ya
// usan las rutas /sincronizar manuales, solo que aquí corre solo, una vez al
// día, así que ningún desajuste se queda pegado más de 24h en vez de para
// siempre. addon_tecnicos NO necesita esto — ese ya se reconcilia solo en
// cada evento customer.subscription.updated del webhook (es plano on/off,
// no por seat).
export const maxDuration = 300;

type ResultadoSeat = { cambio: boolean; error?: string; seats: number };

async function reconciliarSeat(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  stripeSubscriptionId: string,
  seatsReales: number,
  cfg: {
    nivel: string;
    statusActual: string | null;
    itemIdActual: string | null;
    seatsActual: number | null;
    statusCol: string;
    itemIdCol: string;
    seatsCol: string;
    priceId: string | null;
  }
): Promise<ResultadoSeat> {
  // Nada que hacer si el número de seats reales ya coincide con lo último
  // que guardamos — evita llamar a Stripe sin necesidad en la corrida diaria.
  if ((cfg.seatsActual ?? 0) === seatsReales && !(seatsReales === 0 && cfg.statusActual === "activo")) {
    return { cambio: false, seats: seatsReales };
  }

  try {
    if (seatsReales === 0) {
      if (cfg.statusActual === "activo" && cfg.itemIdActual) {
        try {
          await getStripe().subscriptionItems.del(cfg.itemIdActual);
        } catch {
          // Ya no existe en Stripe (borrado a mano, etc.) — igual limpiamos
          // nuestro lado, no dejar al usuario atascado por un error de Stripe.
        }
      }
      await supabase
        .from("users")
        .update({ [cfg.statusCol]: "inactivo", [cfg.itemIdCol]: null, [cfg.seatsCol]: 0 })
        .eq("id", userId);
      return { cambio: true, seats: 0 };
    }

    if (!cfg.priceId) {
      return { cambio: false, error: `Falta el Price ID del addon ${cfg.nivel} en las variables de entorno.`, seats: seatsReales };
    }

    if (cfg.statusActual === "activo" && cfg.itemIdActual) {
      await getStripe().subscriptionItems.update(cfg.itemIdActual, { quantity: seatsReales });
      await supabase.from("users").update({ [cfg.seatsCol]: seatsReales }).eq("id", userId);
    } else {
      const item = await getStripe().subscriptionItems.create({
        subscription: stripeSubscriptionId,
        price: cfg.priceId,
        quantity: seatsReales,
      });
      await supabase
        .from("users")
        .update({ [cfg.statusCol]: "activo", [cfg.itemIdCol]: item.id, [cfg.seatsCol]: seatsReales })
        .eq("id", userId);
    }
    return { cambio: true, seats: seatsReales };
  } catch (err) {
    return { cambio: false, error: err instanceof Error ? err.message : "Error desconocido", seats: seatsReales };
  }
}

export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: usuarios, error: usuariosError } = await supabase
    .from("users")
    .select(
      "id, plan, plan_status, stripe_subscription_id, addon_entidades_status, addon_entidades_item_id, addon_entidades_seats, addon_admin_status, addon_admin_item_id, addon_admin_seats, addon_administrador_status, addon_administrador_item_id, addon_administrador_seats"
    )
    .in("plan", ["pro", "proplus"])
    .eq("plan_status", "active")
    .not("stripe_subscription_id", "is", null);

  if (usuariosError) return NextResponse.json({ error: usuariosError.message }, { status: 500 });
  if (!usuarios || usuarios.length === 0) return NextResponse.json({ ok: true, revisados: 0, corregidos: 0 });

  let corregidos = 0;
  const resultados: Record<string, unknown> = {};

  for (const u of usuarios) {
    try {
      const [{ count: entidadesActivas }, { count: secretariaActivos }, { count: secretariaPendientes }, { count: administradorActivos }, { count: administradorPendientes }] =
        await Promise.all([
          supabase.from("business_entities").select("id", { count: "exact", head: true }).eq("owner_id", u.id).eq("active", true),
          supabase.from("account_members").select("id", { count: "exact", head: true }).eq("owner_id", u.id).eq("role", "admin").eq("active", true).eq("admin_tier", "secretaria"),
          supabase.from("admin_invitations").select("id", { count: "exact", head: true }).eq("owner_id", u.id).eq("status", "pending").eq("admin_tier", "secretaria"),
          supabase.from("account_members").select("id", { count: "exact", head: true }).eq("owner_id", u.id).eq("role", "admin").eq("active", true).eq("admin_tier", "administrador"),
          supabase.from("admin_invitations").select("id", { count: "exact", head: true }).eq("owner_id", u.id).eq("status", "pending").eq("admin_tier", "administrador"),
        ]);

      const seatsEntidades = Math.max((entidadesActivas ?? 0) - 1, 0);
      const seatsSecretaria = (secretariaActivos ?? 0) + (secretariaPendientes ?? 0);
      const seatsAdministrador = (administradorActivos ?? 0) + (administradorPendientes ?? 0);

      const [rEntidades, rSecretaria, rAdministrador] = await Promise.all([
        reconciliarSeat(supabase, u.id, u.stripe_subscription_id!, seatsEntidades, {
          nivel: "entidades",
          statusActual: u.addon_entidades_status,
          itemIdActual: u.addon_entidades_item_id,
          seatsActual: u.addon_entidades_seats,
          statusCol: "addon_entidades_status",
          itemIdCol: "addon_entidades_item_id",
          seatsCol: "addon_entidades_seats",
          priceId: priceIdAddonEntidadAdicional(),
        }),
        reconciliarSeat(supabase, u.id, u.stripe_subscription_id!, seatsSecretaria, {
          nivel: "secretaria",
          statusActual: u.addon_admin_status,
          itemIdActual: u.addon_admin_item_id,
          seatsActual: u.addon_admin_seats,
          statusCol: "addon_admin_status",
          itemIdCol: "addon_admin_item_id",
          seatsCol: "addon_admin_seats",
          priceId: priceIdAddonSecretaria(),
        }),
        reconciliarSeat(supabase, u.id, u.stripe_subscription_id!, seatsAdministrador, {
          nivel: "administrador",
          statusActual: u.addon_administrador_status,
          itemIdActual: u.addon_administrador_item_id,
          seatsActual: u.addon_administrador_seats,
          statusCol: "addon_administrador_status",
          itemIdCol: "addon_administrador_item_id",
          seatsCol: "addon_administrador_seats",
          priceId: priceIdAddonAdministrador(),
        }),
      ]);

      if (rEntidades.cambio || rSecretaria.cambio || rAdministrador.cambio) {
        corregidos++;
        resultados[u.id] = { entidades: rEntidades, secretaria: rSecretaria, administrador: rAdministrador };
      }
    } catch (err) {
      resultados[u.id] = { error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }

  return NextResponse.json({ ok: true, revisados: usuarios.length, corregidos, resultados });
}
