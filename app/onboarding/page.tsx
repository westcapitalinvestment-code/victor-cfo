import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import OnboardingForm from "./onboarding-form";

// Primer paso real para CUALQUIER usuario nuevo (Core o Pro) — antes de
// tocar negocio, entidades o nada más, VICTOR necesita saber quién eres.
// El trigger de 0002 ya crea la fila en `users` (vacía) y `user_profiles`
// al registrarse — aquí se llena de verdad y se marca onboarding_completed.
export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, onboarding_completed")
    .eq("id", user.id)
    .single();

  // Ya completó esto antes — no lo mandamos de vuelta aquí.
  if (profile?.onboarding_completed) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
            V
          </div>
          <span className="text-lg font-medium">VICTOR</span>
        </div>
        <OnboardingForm initialFullName={profile?.full_name ?? ""} />
      </div>
    </div>
  );
}
