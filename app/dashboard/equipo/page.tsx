import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProPaywall from "../pro-paywall";

export default async function EquipoPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).single();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";

  if (!esPro) return <ProPaywall />;

  return (
    <div className="vc-shell">
      <h1 className="mb-4 text-lg font-medium">Equipo</h1>
      <div className="vc-card">
        <p className="text-sm text-muted">Esta sección todavía está en construcción.</p>
      </div>
    </div>
  );
}
