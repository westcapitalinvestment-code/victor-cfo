import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenBajaValido } from "@/lib/email-baja";

// Baja de correos de nurture/tips (link en el pie de cada correo).
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  const t = req.nextUrl.searchParams.get("t") || "";
  const pagina = (msg: string, status = 200) =>
    new Response(
      `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VICTOR CFO</title><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;text-align:center;color:#1a1a1a"><h2>VICTOR CFO</h2><p>${msg}</p></body></html>`,
      { status, headers: { "content-type": "text/html; charset=utf-8" } }
    );

  if (!u || !tokenBajaValido(u, t)) return pagina("El enlace no es válido o expiró.", 400);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ email_marketing_baja_at: new Date().toISOString() })
    .eq("id", u);
  if (error) return pagina("No pudimos procesar la baja. Escríbenos a soporte@victorcfo.com.", 500);
  return pagina("Listo, no recibirás más correos de consejos y novedades. Tu cuenta sigue igual.");
}
