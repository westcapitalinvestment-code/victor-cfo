import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { esFounder } from "@/lib/founder";
import MercadeoPanel from "./mercadeo-panel";

export default async function MercadeoPage() {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) redirect("/login");
  if (!esFounder(user.email)) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-lg font-medium">Mercadeo por correo</h1>
        <Link href="/dashboard/cfo" className="vc-btn-back">← Atrás</Link>
      </div>
      <MercadeoPanel />
    </div>
  );
}
