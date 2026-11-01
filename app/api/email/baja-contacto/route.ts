import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenBajaContactoValido } from "@/lib/email-contactos";

// Baja de la secuencia de correos a contactos con permiso (enlace en el pie de
// cada correo). GET = clic en el enlace; POST = baja de un clic del cliente de
// correo (List-Unsubscribe-Post). Es definitiva: el vendedor no puede revertirla.
async function procesar(req: NextRequest) {
  const c = req.nextUrl.searchParams.get("c") || "";
  const t = req.nextUrl.searchParams.get("t") || "";
  const pagina = (msg: string, status = 200) =>
    new Response(
      `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VICTOR CFO</title><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;text-align:center;color:#1a1a1a"><h2>VICTOR CFO</h2><p>${msg}</p></body></html>`,
      { status, headers: { "content-type": "text/html; charset=utf-8" } }
    );

  if (!c || !tokenBajaContactoValido(c, t)) return pagina("El enlace no es válido o expiró.", 400);

  const admin = createAdminClient();
  const { error } = await admin
    .from("socios_contactos_correo")
    .update({ baja_at: new Date().toISOString(), detenido_razon: "baja_contacto" })
    .eq("id", c)
    .is("baja_at", null);
  if (error) return pagina("No pudimos procesar la baja. Escríbenos a soporte@victorcfo.com.", 500);
  return pagina("Listo, no recibirás más correos nuestros.");
}

export const GET = procesar;
export const POST = procesar;
