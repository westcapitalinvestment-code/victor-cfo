import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { plaidClient, plaidConfigurado } from "@/lib/plaid";
import { Products, CountryCode } from "plaid";

// Primer paso del flujo de Plaid Link: el frontend necesita un link_token
// antes de poder abrir el widget de Plaid. Se crea uno por usuario, nunca
// se comparte entre usuarios ni se guarda — vive solo el tiempo que el
// widget está abierto.
export async function POST() {
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

  try {
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
    return NextResponse.json({ error: "No se pudo iniciar la conexión con Plaid." }, { status: 502 });
  }
}
