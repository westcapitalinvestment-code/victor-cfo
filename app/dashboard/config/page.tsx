import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "../logout-button";
import NotificacionesToggle from "../notificaciones-toggle";
import GestionarPlan from "../gestionar-plan";
import CreditosIA from "../creditos-ia";
import PinConfig from "../pin-config";
import MfaConfig from "../mfa-config";
import SessionTimeoutConfig from "../session-timeout-config";
import ReferralLink from "../referral-link";
import EliminarCuenta from "../eliminar-cuenta";
import EditarCuenta from "../editar-cuenta";

export default async function ConfigPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // .maybeSingle() en vez de .single() (30 agosto 2026, mismo fix que en
  // onboarding/page.tsx y dashboard/page.tsx): .single() truena si por lo
  // que sea la fila no vuelve, y eso tumbaba la página entera en vez de
  // mostrar el fallback "core"/"trialing" de abajo.
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, plan, plan_status, deletion_scheduled_for")
    .eq("id", user.id)
    .maybeSingle();

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id, name, logo_r2_key")
    .eq("owner_id", user.id)
    .eq("active", true);

  const { data: perfilExtendido } = await supabase
    .from("user_profiles")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();

  // Estadísticas reales de crédito de referidos, para la tarjeta visible en
  // ReferralLink (8 sept 2026, pedido de Joel: "seria bueno... que
  // aparecieran los creditos ahí, seria un palo pq asi es visible pq mucha
  // gente ni check casi el email"). referral_rewards tiene RLS encendido
  // SIN políticas (migración 0062) — a propósito, solo el service role
  // puede leerla — así que hace falta el cliente admin aquí, igual que en
  // el tool verificar_programa_referidos (lib/victor/tools.ts), filtrado
  // explícitamente por el id de ESTE usuario, nunca por datos sueltos.
  // Mismos topes que allá y que el webhook — si cambian en uno, cambian en
  // los tres lugares.
  const admin = createAdminClient();
  const TOPE_ANUAL_CORE_CENTAVOS = 17_500; // $175/año
  const TOPE_ANUAL_PRO_CENTAVOS = 50_000; // $500/año
  const inicioAñoISO = `${new Date().getUTCFullYear()}-01-01T00:00:00.000Z`;
  const { data: creditosReferidos } = await admin
    .from("referral_rewards")
    .select("credit_cents, created_at")
    .eq("referrer_id", user.id);
  const acumuladoEsteAñoCentavos = (creditosReferidos ?? [])
    .filter((r) => (r.created_at as string) >= inicioAñoISO)
    .reduce((sum, r) => sum + Number(r.credit_cents), 0);
  const topeAnualCentavos =
    profile?.plan === "pro" || profile?.plan === "proplus" ? TOPE_ANUAL_PRO_CENTAVOS : TOPE_ANUAL_CORE_CENTAVOS;
  const referidosConCredito = (creditosReferidos ?? []).length;

  return (
    <div className="vc-shell">
      <h1 className="mb-4 text-lg font-medium">Configuración</h1>

      <div className="vc-card mb-4">
        <p className="text-sm font-semibold">Cuenta</p>
        <p className="mt-1 text-sm font-medium">{profile?.full_name || user.email}</p>
        <p className="text-xs text-muted">{user.email}</p>
        <EditarCuenta
          fullName={profile?.full_name || ""}
          email={user.email || ""}
          phone={perfilExtendido?.phone || ""}
          plan={profile?.plan ?? "core"}
          planStatus={profile?.plan_status ?? "trialing"}
        />
      </div>

      {/* Área de soporte (30 agosto 2026, pedido de Joel): que ningún
          usuario se sienta solo si algo falla — sobre todo el plan gratis,
          que no tiene acceso a VICTOR para preguntarle nada. Visible para
          todos, en un lugar fijo y fácil de encontrar. */}
      <div className="vc-card mb-4">
        <p className="text-sm font-semibold">Soporte</p>
        <p className="mt-1 text-sm">
          ¿Tienes una pregunta o algo no está funcionando? Escríbenos, te contestamos lo antes posible.
        </p>
        <a
          href="mailto:soporte@westcapitalventuresllc.com"
          className="mt-2 block rounded-lg border border-teal p-3 text-center text-sm font-medium text-teal no-underline"
          style={{ background: "rgba(29,158,117,.1)" }}
        >
          Escríbenos
        </a>
      </div>

      {entities && entities.length > 0 && (
        <div className="vc-card mb-4">
          <p className="mb-2 text-sm font-semibold">Negocio</p>
          {entities.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0"
            >
              <span className="text-sm">{e.name}</span>
              <Link
                href={`/dashboard/entidades/${e.id}/editar`}
                className="shrink-0 rounded-lg border border-teal px-3 py-1.5 text-xs font-medium text-teal"
                style={{ background: "rgba(29,158,117,.1)" }}
              >
                Editar negocio
              </Link>
            </div>
          ))}
        </div>
      )}

      <ReferralLink
        userId={user.id}
        acumuladoEsteAñoCentavos={acumuladoEsteAñoCentavos}
        topeAnualCentavos={topeAnualCentavos}
        referidosConCredito={referidosConCredito}
      />

      <NotificacionesToggle />

      <MfaConfig />

      <PinConfig />

      <SessionTimeoutConfig />

      <GestionarPlan />

      <CreditosIA />

      <EliminarCuenta deletionScheduledFor={profile?.deletion_scheduled_for ?? null} />

      <div className="vc-card">
        <LogoutButton />
      </div>
    </div>
  );
}
