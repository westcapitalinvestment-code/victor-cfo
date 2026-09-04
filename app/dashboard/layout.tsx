import { createClient } from "@/lib/supabase/server";
import { fechaHoyPR } from "@/lib/hora-pr";
import { leerEntidadActivaCookie, resolverEntidadActiva } from "@/lib/entidad-activa";
import { esFounder } from "@/lib/founder";
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
  // esReferido (30 agosto 2026, ajustado 4 sept 2026): solo importa para
  // decidir si le mostramos a un usuario 'gratis' el mensaje de "primer mes
  // gratis" cuando toca algo bloqueado (Plaid o VICTOR) — el precio en sí
  // ya es siempre el normal ($14.99), el beneficio de referido es el mes
  // gratis, no un descuento. No es lo mismo que "referred_by" para el que
  // SÍ paga (eso lo lee el checkout directo de la base de datos); aquí solo
  // es para decidir si se muestra el mensaje.
  let esReferido = false;
  // Entidades de negocio del usuario (solo aplica a Pro) + cuál quedó
  // activa en el selector "Negocio" del topbar — ver lib/entidad-activa.ts.
  let entidadesNegocio: { id: string; name: string }[] = [];
  let entidadActivaId: string | null = null;
  let vistaGlobalNegocio = false;
  let esFounderUsuario = false;
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
      esFounderUsuario = esFounder(user.email);

      const esPro = plan === "pro" || plan === "proplus";
      if (esPro) {
        const { data: entidades } = await supabase
          .from("business_entities")
          .select("id, name")
          .eq("owner_id", user.id)
          .eq("active", true)
          .order("created_at", { ascending: true });
        entidadesNegocio = entidades ?? [];
        const resuelto = resolverEntidadActiva(entidadesNegocio, leerEntidadActivaCookie());
        entidadActivaId = resuelto.entidadId;
        vistaGlobalNegocio = resuelto.vistaGlobal;
      }
    }
  } catch {
    // Si esto falla por lo que sea, simplemente no auto-abrimos el chat —
    // el usuario igual puede abrirlo él mismo con el botón flotante.
  }

  return (
    <PinGate>
      <SessionTimeoutGate />
      <div className="pb-24">
        <Topbar
          fullName={fullName}
          plan={plan}
          entidadesNegocio={entidadesNegocio}
          entidadActivaId={entidadActivaId}
          vistaGlobalNegocio={vistaGlobalNegocio}
        />
        <BadgeUpdater />
        <AutoRefresh />
        {children}
        <VictorChat
          autoOpenOnboarding={autoOpenOnboarding}
          autoOpenSaludoDiario={autoOpenSaludoDiario}
          plan={plan}
          esReferido={esReferido}
        />
        <BottomNav esFounder={esFounderUsuario} />
      </div>
    </PinGate>
  );
}
