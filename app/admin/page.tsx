import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";

// Portal de trabajo real de Admin/Secretaria (2 sept 2026) — punto de
// entrada tras el login (ver app/login/page.tsx). Un admin/secretaria
// SIEMPRE está atado a UNA sola entidad (ver lib/owner-efectivo.ts), así
// que a diferencia de /cpa (que sí muestra una lista de "tus clientes"
// porque un CPA puede tener varios), aquí no hace falta pantalla de
// selección — se resuelve la entidad y se entra directo.
export default async function AdminPortalHome() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const efectivo = await resolverOwnerEfectivo(supabase, user.email);
  // Si el correo no es admin/secretaria de nadie, no le corresponde este
  // portal — lo mandamos a su propio dashboard (si es dueño, ahí vive).
  if (!efectivo || !efectivo.entityIdForzado) redirect("/dashboard");

  redirect(`/admin/${efectivo.entityIdForzado}`);
}
