import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidClient, plaidConfigurado } from "@/lib/plaid";
import { decryptSecret } from "@/lib/crypto";
import { Products, CountryCode } from "plaid";

// Primer paso del flujo de Plaid Link: el frontend necesita un link_token
// antes de poder abrir el widget de Plaid.
//
// Tiene dos modos:
//   - Conexión nueva (sin itemId en el body): pide un link_token normal,
//     con products, para conectar un banco que el usuario nunca ha
//     conectado.
//   - Reconexión / Update Mode (con itemId en el body): el Item ya existe
//     pero perdió el acceso (contraseña cambiada, MFA vencido, etc.) — en
//     vez de pedir un link_token para un banco nuevo, le pasamos a Plaid
//     el access_token del Item existente, y Plaid abre el widget en modo
//     "arregla esta conexión" en vez de "conecta un banco nuevo". Así
//     nunca se crea un Item duplicado al reconectar. (Plaid no permite
//     mandar "products" cuando se usa access_token en Update Mode.)
export async function POST(req: NextRequest) {
  if (!plaidConfigurado()) {
    return NextResponse.json(
      { error: "Plaid no está configurado todavía (falta PLAID_CLIENT_ID / PLAID_SECRET en el servidor)." },
      { status: 500 }
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const itemId: string | undefined = body?.itemId;

  try {
    if (itemId) {
      // Modo reconexión (Update Mode) — verificamos que el Item sea
      // realmente de este usuario antes de descifrar nada.
      const { data: itemRow, error: itemError } = await supabase
        .from("plaid_items")
        .select("id, access_token, owner_id")
        .eq("id", itemId)
        .eq("owner_id", user.id)
        .maybeSingle();

      if (itemError || !itemRow) {
        return NextResponse.json({ error: "No se encontró esa conexión bancaria." }, { status: 404 });
      }

      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: user.id },
        client_name: "VICTOR",
        country_codes: [CountryCode.Us],
        language: "es",
        access_token: decryptSecret(itemRow.access_token),
      });

      return NextResponse.json({ linkToken: response.data.link_token });
    }

    // Modo conexión nueva — como siempre.
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "VICTOR",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "es",
    });

    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (err) {
    console.error("Error creando link_token de Plaid:", err);
    const conRespuesta = err as { response?: { data?: { error_code?: string; error_message?: string } } };
    const detalle = conRespuesta?.response?.data;
    return NextResponse.json(
      {
        error: "No se pudo iniciar la conexión con Plaid.",
        detalle: detalle?.error_message || detalle?.error_code || (err instanceof Error ? err.message : String(err)),
        // Temporal — para confirmar sin ambigüedad contra qué ambiente de
        // Plaid está pegando el servidor ahora mismo (a veces PLAID_ENV
        // queda mal escrito en Vercel y cae en sandbox sin avisar).
        ambiente: process.env.PLAID_ENV || "(vacío — cayó en sandbox por defecto)",
      },
      { status: 502 }
    );
  }
}
