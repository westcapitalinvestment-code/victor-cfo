import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";
import NuevoDocumentoAdminForm from "./nuevo-documento-admin-form";

export default async function AdminNuevoDocumentoPage({ params }: { params: { entityId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) redirect("/login");

  const efectivo = await resolverOwnerEfectivo(supabase, user.email);
  if (!efectivo || !efectivo.entityIdForzado) redirect("/dashboard");
  if (params.entityId !== efectivo.entityIdForzado) redirect(`/admin/${efectivo.entityIdForzado}`);
  if (efectivo.adminTier !== "administrador") redirect(`/admin/${efectivo.entityIdForzado}`);

  return <NuevoDocumentoAdminForm entidadId={efectivo.entityIdForzado} ownerIdEfectivo={efectivo.ownerId} />;
}
