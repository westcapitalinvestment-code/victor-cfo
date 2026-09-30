import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LandingPage from "./landing-page";

// Raíz del dominio (victorcfo.com). Si ya hay sesión, directo al
// dashboard — no tiene caso mostrarle el landing a alguien que ya es
// usuario. Si no hay sesión, ve el landing page real (tiene que
// vender/explicar qué es VICTOR a un visitante nuevo de la web).
//
// La app nativa (App Store/Google Play) NO pasa por aquí — Capacitor la
// manda directo a /login (ver server.url en capacitor.config.ts), así
// que esta página se queda simple y solo sirve a la web normal.
export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return <LandingPage />;
}
