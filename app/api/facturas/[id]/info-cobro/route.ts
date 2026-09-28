import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Info mínima y NO sensible que necesita la página pública /cobro/[id] para
// mostrar el QR unificado (28 sept 2026, pedido de Joel: "un POS con QR...
// que el cliente escanee y seleccione como lo quiere pagar"). Pública a
// propósito, igual que /api/facturas/[id]/pagar — el id es un UUID, y aquí
// solo se expone el total, el nombre del negocio, y si hay Stripe/ATH Móvil
// disponibles. Nunca se exponen datos del cliente ni tokens privados.
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createAdminClient();

  const { data: factura, error } = await supabase
    .from("invoices")
    .select(
      "id, numero, total, estado, business_entities(name, stripe_connect_account_id, stripe_connect_charges_enabled, ath_movil_public_token)"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error || !factura) {
    return NextResponse.json({ error: "Factura no encontrada." }, { status: 404 });
  }

  const entidad = (factura as any).business_entities as {
    name: string;
    stripe_connect_account_id: string | null;
    stripe_connect_charges_enabled: boolean | null;
    ath_movil_public_token: string | null;
  } | null;

  const total = Number((factura as any).total ?? 0);
  // El Payment Button de ATH Móvil solo acepta montos entre $1.00 y
  // $1,500.00 (límite documentado de Evertec) — fuera de ese rango no se
  // ofrece la opción, para no llevar al cliente a un botón que va a fallar.
  const athDisponible = !!entidad?.ath_movil_public_token && total >= 1 && total <= 1500;

  return NextResponse.json({
    numero: (factura as any).numero,
    total,
    pagada: factura.estado === "pagada",
    negocioNombre: entidad?.name ?? "",
    tarjetaDisponible: !!(entidad?.stripe_connect_account_id && entidad?.stripe_connect_charges_enabled),
    athDisponible,
    athPublicToken: athDisponible ? entidad!.ath_movil_public_token : null,
  });
}
