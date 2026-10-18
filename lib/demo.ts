import type { SupabaseClient } from "@supabase/supabase-js";

// Cuentas de demostración (users.is_demo = true, migración 0087): la de
// cliente y la del CPA contable (soporte+democpa@victorcfo.com, migración
// 0166). Cualquier acción con efecto real hacia afuera —correos a terceros,
// cobros en Stripe, publicar en el directorio, PIN/SMS de Plaid— debe
// cortocircuitarse con esto y responder una simulación.
export async function esCuentaDemo(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from("users").select("is_demo").eq("id", userId).maybeSingle();
  return !!data?.is_demo;
}
