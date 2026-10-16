import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenBajaMktValido } from "@/lib/email-mercadeo";

// Baja de correos de mercadeo (enlace en el pie + List-Unsubscribe).
async function procesar(p: string, t: string) {
  if (!p || !tokenBajaMktValido(p, t)) return { ok: false, status: 400, msg: "El enlace no es válido o expiró." };
  const { error } = await createAdminClient()
    .from("mkt_prospectos")
    .update({ estado: "baja", baja_at: new Date().toISOString() })
    .eq("id", p);
  if (error) return { ok: false, status: 500, msg: "No pudimos procesar la baja. Escríbenos a soporte@victorcfo.com." };
  return { ok: true, status: 200, msg: "Listo, no recibirás más correos de VICTOR CFO." };
}

export async function GET(req: NextRequest) {
  const r = await procesar(req.nextUrl.searchParams.get("p") || "", req.nextUrl.searchParams.get("t") || "");
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VICTOR CFO</title><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;text-align:center;color:#1a1a1a"><h2>VICTOR CFO</h2><p>${r.msg}</p></body></html>`,
    { status: r.status, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

// One-click (RFC 8058): Gmail/Yahoo hacen POST al enlace.
export async function POST(req: NextRequest) {
  const r = await procesar(req.nextUrl.searchParams.get("p") || "", req.nextUrl.searchParams.get("t") || "");
  return new Response(r.msg, { status: r.status });
}
