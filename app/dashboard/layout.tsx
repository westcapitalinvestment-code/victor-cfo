import { createClient } from "@/lib/supabase/server";
import { fechaHoyPR } from "@/lib/hora-pr";
import BottomNav from "./bottom-nav";
import VictorChat from "./victor-chat";
import Topbar from "./topbar";
import BadgeUpdater from "./badge-updater";
import AutoRefresh from "./auto-refresh";
import PinGate from "./pin-gate";
import SessionTimeoutGate from "./session-timeout-gate";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let autoOpenOnboarding = false;
  let autoOpenSaludoDiario = false;
  let fullName: string | null = null;
  let plan: string | null = null;
  let esReferido = false;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("perfil_completo, ultimo_saludo_en")
        .eq("id", user.id)
        .maybeSingle();
      autoOpenOnboarding = profile ? !profile.perfil_completo : false;
      autoOpenSaludoDiario = !!profile?.perfil_completo && profile.ultimo_saludo_en !== fechaHoyPR();

      const { data: userRow } = await supabase
        .from("users")
        .select("full_name, plan, referred_by")
        .eq("id", user.id)
        .maybeSingle();
      fullName = userRow?.full_name ?? null;
      plan = userRow?.plan ?? null;
      esReferido = !!userRow?.referred_by;
    }
  } catch {
    // Si esto falla, no auto-abrimos el chat.
  }

  return (
    <PinGate>
      <SessionTimeoutGate />
      <div className="pb-24">
        <Topbar fullName={fullName} plan={plan} />
        <BadgeUpdater />
        <AutoRefresh />
        {children}
        <VictorChat
          autoOpenOnboarding={autoOpenOnboarding}
          autoOpenSaludoDiario={autoOpenSaludoDiario}
          plan={plan}
          esReferido={esReferido}
        />
        <BottomNav />
      </div>
    </PinGate>
  );
}
