import { createClient } from "@/lib/supabase/server";
import BottomNav from "./bottom-nav";
import VictorChat from "./victor-chat";
import Topbar from "./topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Si el usuario todavía no pasó por el onboarding conversacional de
  // VICTOR (Capa 2 — apodo, género, edad, situación, hijos), le decimos al
  // chat que se abra solo y arranque esa conversación en cuanto llegue al
  // dashboard, en vez de esperar a que él le escriba primero.
  let autoOpenOnboarding = false;
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
        .select("perfil_completo")
        .eq("id", user.id)
        .maybeSingle();
      autoOpenOnboarding = profile ? !profile.perfil_completo : false;

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
    <div className="pb-24">
      <Topbar fullName={fullName} plan={plan} />
      {children}
      <VictorChat autoOpenOnboarding={autoOpenOnboarding} />
      <BottomNav />
    </div>
  );
}
