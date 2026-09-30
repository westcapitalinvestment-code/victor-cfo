import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import LandingPage from "./landing-page";

// Raíz del dominio (victorcfo.com). Si ya hay sesión, directo al
// dashboard — no tiene caso mostrarle el landing a alguien que ya es
// usuario. Si no hay sesión, normalmente ve el landing page real (tiene
// que vender/explicar qué es VICTOR a un visitante nuevo de la web).
//
// EXCEPCIÓN: dentro de la app nativa (App Store/Google Play) no tiene
// sentido mostrar el landing — quien la bajó ya decidió probar VICTOR,
// así que abre directo en /login (como cualquier app), con un botón ahí
// para crear cuenta si no tiene. Se distingue "app nativa" vs "navegador
// normal" por el User-Agent que le metimos en capacitor.config.ts
// (appendUserAgent: "VictorCFOApp") — no afecta nada de la web normal.
export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  const headersList = headers();
  const userAgent = headersList.get("user-agent") ?? "";
  if (userAgent.includes("VictorCFOApp")) redirect("/login");

  return <LandingPage />;
}
