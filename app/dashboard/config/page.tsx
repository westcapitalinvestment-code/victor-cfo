import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, plan, plan_status")
    .eq("id", user.id)
    .single();

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
