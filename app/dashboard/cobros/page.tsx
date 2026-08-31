import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProPaywall from "../pro-paywall";
import CobrosLista from "./cobros-lista";

export default async function CobrosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";
  if (!esPro) return <ProPaywall />;

  // Cobros = todo lo que ya se le envió al cliente y todavía no está
  // pagado (excluye borrador — eso ni siquiera salió del lado de VICTOR
  // todavía, no hay nada que "cobrar" aún).
  const { data: facturas, error } = await supabase
    .from("invoices")
    .select("id, numero, total, estado, fecha_vencimiento, clients(name)")
    .eq("owner_id", user.id)
    .in("estado", ["enviada", "vista"])
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

  // Supabase infiere la relación anidada clients(name) como arreglo (no
  // conoce la cardinalidad 1:1 sin tipos generados de la base de datos) —
  // en tiempo de ejecución siempre viene como objeto único porque
  // invoices.client_id apunta a una sola fila. any documenta esa
  // discrepancia en un solo punto en vez de pelear con el tipo generado.
  return <CobrosLista facturasIniciales={(facturas ?? []) as any} errorCarga={error?.message ?? null} />;
}
