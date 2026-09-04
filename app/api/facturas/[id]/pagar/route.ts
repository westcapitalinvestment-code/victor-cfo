import { NextRequest, NextResponse } from "next/server";
import { resolverLinkCobro } from "@/lib/stripe-connect-checkout";

// Link ESTABLE de cobro con tarjeta (3 sept 2026, pedido de Joel: que el
// email y el PDF de la factura "jalen" el link de Stripe Connect) — PÚBLICA
// a propósito, igual que /api/facturas/[id]/pdf: el id es un UUID
// prácticamente imposible de adivinar, así el cliente puede pagar desde el
// correo o el PDF sin tener que iniciar sesión.
//
// Este endpoint NUNCA se guarda como el link final de Stripe — ese expira a
// las 24h. En cambio, esta URL (que sí es permanente) se pega en el correo
// y en el PDF, y cada vez que alguien la visita, resuelve/crea la sesión de
// Stripe vigente y hace un redirect 302 — así el link nunca muere aunque la
// sesión de Stripe detrás sí.
export const dynamic = "force-dynamic";

function paginaMensaje(titulo: string, mensaje: string): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titulo}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f7f9f8; color: #1a1a1a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
  .caja { max-width: 420px; text-align: center; background: #fff; border-radius: 16px; padding: 32px 24px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p { font-size: 14px; color: #666; margin: 0; }
</style></head>
<body><div class="caja"><h1>${titulo}</h1><p>${mensaje}</p></div></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const resultado = await resolverLinkCobro(params.id);

  if (!resultado.ok) {
    const titulo = resultado.error === "Esta factura ya está pagada." ? "Ya está pagada ✓" : "No se pudo generar el cobro";
    return paginaMensaje(titulo, resultado.error);
  }

  return NextResponse.redirect(resultado.url, { status: 302 });
}
