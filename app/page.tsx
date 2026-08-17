import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LandingPage from "./landing-page";

// Raíz del dominio (victorcfo.com). Si ya hay sesión, directo al
// dashboard — no tiene caso mostrarle el landing a alguien que ya es
// usuario. Si no, ve el landing page real (antes esto redirigía sin más
// a /login, que no tenía nada que vender ni explicar).
export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return <LandingPage />;
}
