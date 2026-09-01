import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import LogoutButton from "../logout-button";
import NotificacionesToggle from "../notificaciones-toggle";
import GestionarPlan from "../gestionar-plan";
import PinConfig from "../pin-config";
import SessionTimeoutConfig from "../session-timeout-config";
import ReferralLink from "../referral-link";

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
    .select("full_name, plan, plan_status")
    .eq("id", user.id)
    .maybeSingle();

  const { data: entities } = await supabase
    .from("business_entities")
    .select("id, name, logo_r2_key")
    .eq("owner_id", user.id)
    .eq("active", true);

  return (
    <div className="vc-shell">
      <h1 className="mb-4 text-lg font-medium">Configuración</h1>

      <div className="vc-card mb-4">
        <p className="text-xs uppercase tracking-wide text-muted">Cuenta</p>
        <p className="mt-1 text-sm font-medium">{profile?.full_name || user.email}</p>
        <p className="text-xs text-muted">{user.email}</p>
        <p className="mt-2 inline-block rounded bg-teal/10 px-2 py-1 text-xs font-medium text-teal">
          Plan {profile?.plan ?? "core"} · {profile?.plan_status ?? "trialing"}
        </p>
      </div>

      {/* Área de soporte (30 agosto 2026, pedido de Joel): que ningún
          usuario se sienta solo si algo falla — sobre todo el plan gratis,
          que no tiene acceso a VICTOR para preguntarle nada. Visible para
          todos, en un lugar fijo y fácil de encontrar. */}
      <div className="vc-card mb-4">
        <p className="text-xs uppercase tracking-wide text-muted">Soporte</p>
        <p className="mt-1 text-sm">
          ¿Tienes una pregunta o algo no está funcionando? Escríbenos, te contestamos lo antes posible.
        </p>
        <a
          href="mailto:soporte@westcapitalventuresllc.com"
          className="vc-btn-secondary mt-2 inline-block text-center no-underline"
        >
          Escríbenos
        </a>
      </div>

      {entities && entities.length > 0 && (
        <div className="vc-card mb-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Negocio</p>
          {entities.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/entidades/${e.id}/editar`}
              className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0"
            >
              <span>{e.name}</span>
              <span className="text-xs text-teal">{e.logo_r2_key ? "Editar logo" : "Añadir logo"} →</span>
            </Link>
          ))}
        </div>
      )}

      <ReferralLink userId={user.id} />

      <NotificacionesToggle />

      <PinConfig />

      <SessionTimeoutConfig />

      <GestionarPlan />

      <div className="vc-card">
        <LogoutButton />
      </div>
    </div>
  );
}
