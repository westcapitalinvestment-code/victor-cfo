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
  // Si el usuario todavía no pasó por el onboarding conversacional de
  // VICTOR (Capa 2 — apodo, género, edad, situación, hijos), le decimos al
  // chat que se abra solo y arranque esa conversación en cuanto llegue al
  // dashboard, en vez de esperar a que él le escriba primero.
  let autoOpenOnboarding = false;
  // Una vez el onboarding ya pasó, VICTOR toma la iniciativa una vez al día:
  // se abre solo y saluda con lo que pasó de madrugada (sync automático de
  // Plaid) — así el usuario siente un CFO trabajando 24/7, no una app que
  // solo reacciona cuando le escriben.
  let autoOpenSaludoDiario = false;
  let fullName: string | null = null;
  let plan: string | null = null;
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
        .select("full_name, plan")
        .eq("id", user.id)
        .maybeSingle();
      fullName = userRow?.full_name ?? null;
      plan = userRow?.plan ?? null;
    }
  } catch {
    // Si esto falla por lo que sea, simplemente no auto-abrimos el chat —
    // el usuario igual puede abrirlo él mismo con el botón flotante.
  }

  return (
    <PinGate>
      <SessionTimeoutGate />
      <div className="pb-24">
        <Topbar fullName={fullName} plan={plan} />
        <BadgeUpdater />
        <AutoRefresh />
        {children}
        <VictorChat autoOpenOnboarding={autoOpenOnboarding} autoOpenSaludoDiario={autoOpenSaludoDiario} />
        <BottomNav />
      </div>
    </PinGate>
  );
}
