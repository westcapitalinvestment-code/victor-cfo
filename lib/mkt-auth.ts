import { createClient } from "@/lib/supabase/server";
import { esFounder } from "@/lib/founder";

export async function requerirFounder(): Promise<boolean> {
  const { data: { user } } = await createClient().auth.getUser();
  return !!user && esFounder(user.email);
}
