import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProPaywall from "../pro-paywall";

// Pantalla nueva (30-31 agosto 2026) — pagarle a contratistas/técnicos con
// retención 480.6A/B. Es el reverso de Facturación: ahí el negocio COBRA,
// acá el negocio PAGA. Ya existen las tablas vendors/vendor_retenciones/
// vendor_480_validation (0001) — falta construir la UI. Mismo cascarón que
// tenían Facturas y Cobros antes de esta ronda.
export default async function PagosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
  const esPro = profile?.plan === "pro" || profile?.plan === "proplus";

  if (!esPro) return <ProPaywall />;

  return (
    <div className="vc-shell">
      <h1 className="mb-4 text-lg font-medium">Pagos</h1>
      <div className="vc-card">
        <p className="text-sm text-muted">
          Esta sección todavía está en construcción — aquí vas a poder pagarle a tus contratistas y
          técnicos, con la retención 480.6 calculada automático.
        </p>
      </div>
    </div>
  );
}
